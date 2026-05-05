WITH
amm_pools AS (
    SELECT DISTINCT amm_pool
    FROM {db_dex:Identifier}.state_pools_aggregating_by_mint
    WHERE empty({mint:Array(String)}) OR mint IN {mint:Array(String)}
    AND (isNull({protocol:Nullable(String)}) OR protocol = {protocol:Nullable(String)})
    LIMIT 100000
),
pools AS (
    SELECT
        protocol,
        program_id,
        amm,
        amm_pool,
        sum(transactions) as transactions
    FROM {db_dex:Identifier}.state_pools_aggregating_by_pool
    WHERE amm_pool != ''
    AND (empty({amm_pool:Array(String)}) OR amm_pool IN {amm_pool:Array(String)})
    AND (empty({amm:Array(String)}) OR amm IN {amm:Array(String)})
    AND (empty({mint:Array(String)}) OR amm_pool IN amm_pools)
    AND (isNull({protocol:Nullable(String)}) OR protocol = {protocol:Nullable(String)})

    GROUP BY protocol, program_id, amm, amm_pool

    ORDER BY transactions DESC
    LIMIT   {limit:UInt64}
    OFFSET  {offset:UInt64}
),
pools_with_tokens AS (
    SELECT
        amm_pool,
        amm,
        protocol,
        program_id,
        arraySort(groupArrayDistinct(mint)) as tokens,
        arrayElement(tokens, 1) AS token0,
        arrayElement(tokens, 2) AS token1

    FROM {db_dex:Identifier}.state_pools_aggregating_by_mint AS pt
    WHERE amm_pool IN (SELECT amm_pool FROM pools)
    GROUP BY protocol, program_id, amm, amm_pool
)
SELECT
    /* DEX */
    p.program_id AS program_id,
    program_names(p.program_id) AS program_name,
    p.protocol AS protocol,
    p.amm as amm,
    program_names(p.amm) as amm_name,
    p.amm_pool AS amm_pool,
    pt.token0 AS input_mint,
    pt.token1 AS output_mint,
    p.transactions as transactions,

    /* Network */
    {network: String} AS network
FROM pools AS p
JOIN pools_with_tokens AS pt ON p.amm_pool = pt.amm_pool
ORDER BY p.transactions DESC
