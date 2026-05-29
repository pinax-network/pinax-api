SELECT
    factory,
    protocol,
    /* count() as pools, */
    max(max_timestamp) as last_activity,
    sum(transactions) as transactions,
    uniqMerge(uniq_user) as uaw,
    {network: String} AS network
FROM {db_dex:Identifier}.state_pools_aggregating_by_pool
/* Operator-controlled exclusions for protocols whose substreams decoders are known
   to emit duplicates of another protocol. See config.EXCLUDED_EVM_PROTOCOLS. */
WHERE toString(protocol) NOT IN {excluded_protocols:Array(String)}
GROUP BY
    protocol,
    factory
ORDER BY transactions DESC
LIMIT   {limit:UInt64}
OFFSET  {offset:UInt64}
