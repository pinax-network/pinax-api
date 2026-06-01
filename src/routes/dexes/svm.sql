SELECT
    toString(program_id) AS program_id,
    program_names(p.program_id) AS program_name,
    toString(amm) AS amm,
    program_names(p.amm) AS amm_name,
    IF(program_id = amm, false, true) AS is_aggregator,
    sum(transactions) AS transactions
FROM {db_dex:Identifier}.state_pools_aggregating_by_pool AS p
GROUP BY
    p.program_id,
    p.amm
ORDER BY transactions DESC, program_id ASC, amm ASC
LIMIT   {limit:UInt64}
OFFSET  {offset:UInt64}
