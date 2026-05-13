WITH
output_pools AS (
    SELECT DISTINCT pool
    FROM {db_dex:Identifier}.state_pools_aggregating_by_token
    WHERE token IN {output_token:Array(String)}
),
input_pools AS (
    SELECT DISTINCT pool
    FROM {db_dex:Identifier}.state_pools_aggregating_by_token
    WHERE token IN {input_token:Array(String)}
),
pools AS (
    SELECT
        pool,
        factory,
        protocol,
        sum(transactions) as transactions
    FROM {db_dex:Identifier}.state_pools_aggregating_by_pool
    WHERE
        /* cow and dodo are decoded from router/aggregator contracts, not liquidity pools —
           their factory == pool address is a single settlement/routing contract handling
           thousands of unrelated pairs. They belong in /v1/evm/swaps, not /v1/evm/pools.
           Tracked at https://github.com/pinax-network/substreams-evm */
        toString(protocol) NOT IN ('cow', 'dodo')
    AND (empty({input_token:Array(String)}) OR pool IN input_pools)
    AND (empty({output_token:Array(String)}) OR pool IN output_pools)
    AND (empty({pool:Array(String)}) OR pool IN {pool:Array(String)})
    AND (empty({factory:Array(String)}) OR factory IN {factory:Array(String)})
    AND (isNull({protocol:Nullable(String)}) OR toString(protocol) = {protocol:Nullable(String)})

    GROUP BY pool, factory, protocol

    ORDER BY transactions DESC
    LIMIT   {limit:UInt64}
    OFFSET  {offset:UInt64}
),
pools_with_tokens AS (
    SELECT
        pool,
        factory,
        protocol,
        arraySort(groupArrayDistinct(token)) as tokens,
        arrayElement(tokens, 1) AS token0,
        arrayElement(tokens, 2) AS token1

    FROM {db_dex:Identifier}.state_pools_aggregating_by_token AS pt
    JOIN pools AS p ON p.pool = pt.pool AND p.factory = pt.factory AND p.protocol = pt.protocol
    GROUP BY pool, factory, protocol
)
SELECT
    /* DEX */
    p.pool AS pool,
    p.factory AS factory,
    p.protocol AS protocol,

    /* tokens */
    CAST ((
        pt.token0,
        m0.symbol,
        m0.decimals
    ) AS Tuple(address String, symbol String, decimals UInt8)) AS input_token,

    CAST ((
        pt.token1,
        m1.symbol,
        m1.decimals
    ) AS Tuple(address String, symbol String, decimals UInt8)) AS output_token,

    /* Fees */
    f.fee AS fee,

    /* Network */
    {network: String} AS network
FROM pools AS p
ANY LEFT JOIN {db_dex:Identifier}.state_pools_fees AS f ON p.pool = f.pool AND p.factory = f.factory AND p.protocol = f.protocol
JOIN pools_with_tokens AS pt ON p.pool = pt.pool AND p.factory = pt.factory AND p.protocol = pt.protocol
ANY LEFT JOIN metadata.metadata AS m0 ON {network: String} = m0.network AND pt.token0 = m0.contract
ANY LEFT JOIN metadata.metadata AS m1 ON {network: String} = m1.network AND pt.token1 = m1.contract
ORDER BY p.transactions DESC
