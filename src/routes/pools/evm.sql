WITH
/* Materialize the token→pool maps as single-row scalar arrays so they are
   computed at most once. pool_stats references each via IN (SELECT arrayJoin…),
   and the analyzer inlines pool_stats into pool_tokens/fees as IN-subqueries —
   without scalar materialization, every pool_stats inline re-runs the underlying
   state_pools_aggregating_by_token scan for the token filter. */
input_pools AS (
    SELECT groupArray(pool) AS pools FROM (
        SELECT DISTINCT pool
        FROM {db_dex:Identifier}.state_pools_aggregating_by_token
        WHERE token IN {input_token:Array(String)}
    )
),
output_pools AS (
    SELECT groupArray(pool) AS pools FROM (
        SELECT DISTINCT pool
        FROM {db_dex:Identifier}.state_pools_aggregating_by_token
        WHERE token IN {output_token:Array(String)}
    )
),
pool_stats AS (
    /* Rank pools using state_pools_aggregating_by_pool's prj_group_by_pool projection.
       Each pool transaction increments transactions by 1 here, so sum() is the true
       per-pool count — sourcing from state_pools_aggregating_by_token would multiply
       by the number of tokens in the pool (2 for normal AMMs, 3+ for Curve/Balancer)
       and re-order multi-token pools incorrectly.

       Tiebreaker on (pool, factory, protocol) is required for deterministic pagination
       — without it, pools with equal transaction counts can shuffle between pages. */
    SELECT
        pool,
        factory,
        protocol,
        sum(transactions) AS transactions
    FROM {db_dex:Identifier}.state_pools_aggregating_by_pool
    WHERE
        /* Aggregator/router protocols (settlement contracts, not liquidity pools) belong
           in /v1/evm/swaps and /v1/evm/dexes — exclude here. List maintained in
           AGGREGATOR_EVM_PROTOCOLS in src/config.ts. */
        toString(protocol) NOT IN {aggregator_protocols:Array(String)}
        /* Protocols whose substreams decoders are known to emit duplicates of another
           protocol. List maintained in EXCLUDED_EVM_PROTOCOLS in src/config.ts. */
    AND toString(protocol) NOT IN {excluded_protocols:Array(String)}
    AND (empty({input_token:Array(String)})  OR pool IN (SELECT arrayJoin(pools) FROM input_pools))
    AND (empty({output_token:Array(String)}) OR pool IN (SELECT arrayJoin(pools) FROM output_pools))
    AND (empty({pool:Array(String)})         OR pool IN {pool:Array(String)})
    AND (empty({factory:Array(String)})      OR factory IN {factory:Array(String)})
    AND (isNull({protocol:Nullable(String)}) OR toString(protocol) = {protocol:Nullable(String)})

    GROUP BY pool, factory, protocol

    ORDER BY transactions DESC, pool ASC, factory ASC, protocol ASC
    LIMIT   {limit:UInt64}
    OFFSET  {offset:UInt64}
),
pool_tokens AS (
    /* Resolve token0/token1 for the top-N pools via state_pools_aggregating_by_token's
       prj_group_by_pool projection. The projection's GROUP BY (pool, factory, protocol)
       becomes its sort key, so (pool, factory, protocol) IN (top-N) is a tight index
       lookup, not a full scan. */
    SELECT
        pool,
        factory,
        protocol,
        arraySort(groupArrayDistinct(token))[1] AS token0,
        arraySort(groupArrayDistinct(token))[2] AS token1
    FROM {db_dex:Identifier}.state_pools_aggregating_by_token
    WHERE (pool, factory, protocol) IN (SELECT pool, factory, protocol FROM pool_stats)
    GROUP BY pool, factory, protocol
),
pools AS (
    SELECT
        s.pool         AS pool,
        s.factory      AS factory,
        s.protocol     AS protocol,
        s.transactions AS transactions,
        t.token0       AS token0,
        t.token1       AS token1
    FROM pool_stats AS s
    JOIN pool_tokens AS t USING (pool, factory, protocol)
),
fees AS (
    /* Push the top-N (pool, factory, protocol) tuples as an index predicate on
       state_pools_fees — its ORDER BY (pool, factory, protocol) primary key now
       prunes the scan to just the matching granules instead of a full-table hash build. */
    SELECT pool, factory, protocol, any(fee) AS fee
    FROM {db_dex:Identifier}.state_pools_fees
    WHERE (pool, factory, protocol) IN (SELECT pool, factory, protocol FROM pool_stats)
    GROUP BY pool, factory, protocol
),
meta AS (
    /* Resolve token symbol/decimals via a single point lookup against metadata.metadata's
       (network, contract) primary key — replaces two independent full-table scans. */
    SELECT contract, any(symbol) AS symbol, any(decimals) AS decimals
    FROM metadata.metadata
    WHERE network = {network:String}
      AND contract IN (SELECT arrayJoin([token0, token1]) FROM pools)
    GROUP BY contract
)
SELECT
    /* DEX */
    p.pool     AS pool,
    p.factory  AS factory,
    p.protocol AS protocol,

    /* tokens */
    CAST ((
        p.token0,
        m0.symbol,
        m0.decimals
    ) AS Tuple(address String, symbol String, decimals UInt8)) AS input_token,

    CAST ((
        p.token1,
        m1.symbol,
        m1.decimals
    ) AS Tuple(address String, symbol String, decimals UInt8)) AS output_token,

    /* Fees */
    f.fee AS fee,

    /* Stats */
    p.transactions AS transactions,

    /* Network */
    {network:String} AS network
FROM pools AS p
ANY LEFT JOIN fees AS f USING (pool, factory, protocol)
ANY LEFT JOIN meta AS m0 ON m0.contract = p.token0
ANY LEFT JOIN meta AS m1 ON m1.contract = p.token1
ORDER BY p.transactions DESC, p.pool ASC, p.factory ASC, p.protocol ASC
