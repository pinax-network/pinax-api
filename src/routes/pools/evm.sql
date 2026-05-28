WITH
input_pools AS (
    SELECT DISTINCT pool
    FROM {db_dex:Identifier}.state_pools_aggregating_by_token
    WHERE token IN {input_token:Array(String)}
),
output_pools AS (
    SELECT DISTINCT pool
    FROM {db_dex:Identifier}.state_pools_aggregating_by_token
    WHERE token IN {output_token:Array(String)}
),
pools AS (
    /* One pass over state_pools_aggregating_by_token: its prj_group_by_pool projection
       pre-aggregates sum(transactions) and arraySort(groupArrayDistinct(token)) GROUP BY
       (pool, factory, protocol), so we get the top-N pools AND their token pair in a
       single read — no separate state_pools_aggregating_by_pool scan, no pools_with_tokens
       re-join, no double-evaluation of this CTE downstream. */
    SELECT
        pool,
        factory,
        protocol,
        sum(transactions) AS transactions,
        arraySort(groupArrayDistinct(token))[1] AS token0,
        arraySort(groupArrayDistinct(token))[2] AS token1
    FROM {db_dex:Identifier}.state_pools_aggregating_by_token
    WHERE
        /* cow and dodo are decoded from router/aggregator contracts, not liquidity pools —
           their factory == pool address is a single settlement/routing contract handling
           thousands of unrelated pairs. They belong in /v1/evm/swaps, not /v1/evm/pools.
           Tracked at https://github.com/pinax-network/substreams-evm */
        toString(protocol) NOT IN ('cow', 'dodo')
    AND (empty({input_token:Array(String)})  OR pool IN input_pools)
    AND (empty({output_token:Array(String)}) OR pool IN output_pools)
    AND (empty({pool:Array(String)})         OR pool IN {pool:Array(String)})
    AND (empty({factory:Array(String)})      OR factory IN {factory:Array(String)})
    AND (isNull({protocol:Nullable(String)}) OR toString(protocol) = {protocol:Nullable(String)})

    GROUP BY pool, factory, protocol

    ORDER BY transactions DESC
    LIMIT   {limit:UInt64}
    OFFSET  {offset:UInt64}
),
fees AS (
    /* Push the top-N (pool, factory, protocol) tuples as an index predicate on
       state_pools_fees — its ORDER BY (pool, factory, protocol) primary key now
       prunes the scan to just the matching granules instead of a full-table hash build. */
    SELECT pool, factory, protocol, any(fee) AS fee
    FROM {db_dex:Identifier}.state_pools_fees
    WHERE (pool, factory, protocol) IN (SELECT pool, factory, protocol FROM pools)
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

    /* Network */
    {network: String} AS network
FROM pools AS p
ANY LEFT JOIN fees AS f USING (pool, factory, protocol)
ANY LEFT JOIN meta AS m0 ON m0.contract = p.token0
ANY LEFT JOIN meta AS m1 ON m1.contract = p.token1
ORDER BY p.transactions DESC
