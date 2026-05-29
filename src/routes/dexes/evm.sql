SELECT
    factory,
    protocol,
    /* count() as pools, */
    max(max_timestamp) as last_activity,
    sum(transactions) as transactions,
    uniqMerge(uniq_user) as uaw,
    {network: String} AS network
FROM {db_dex:Identifier}.state_pools_aggregating_by_pool
/* Protocols whose substreams decoders are known to emit duplicates of another
   protocol. List maintained in EXCLUDED_EVM_PROTOCOLS in src/config.ts. */
WHERE toString(protocol) NOT IN {excluded_protocols:Array(String)}
GROUP BY
    protocol,
    factory
ORDER BY transactions DESC
LIMIT   {limit:UInt64}
OFFSET  {offset:UInt64}
