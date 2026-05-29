SELECT
    factory,
    protocol,
    /* count() as pools, */
    max(max_timestamp) as last_activity,
    sum(transactions) as transactions,
    uniqMerge(uniq_user) as uaw,
    {network: String} AS network
FROM {db_dex:Identifier}.state_pools_aggregating_by_pool
/* kyber_elastic shares the Uniswap V3 swap event signature, so substreams emits a
   duplicate row for every v3 pool labeled 'kyber_elastic'. Drop it here until the
   substreams decoder disambiguates.
   Tracked at https://github.com/pinax-network/substreams-evm */
WHERE toString(protocol) != 'kyber_elastic'
GROUP BY
    protocol,
    factory
ORDER BY transactions DESC
LIMIT   {limit:UInt64}
OFFSET  {offset:UInt64}
