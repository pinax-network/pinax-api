
/* 1) Get the cutoff for native token - 100 by default, pick optimal number by chain based token value and activity */
/* With optimal cutoff number, distinct holders with that cutoff should be at least 1000, but reasonable for the query performance: */
/* SELECT countDistinct(address) FROM native_balances WHERE balance > N * pow(10, 18); */
WITH cutoff AS (
    SELECT
        multiIf(
            {network:String} = 'unichain', toUInt256(1 * pow(10, 18)),
            {network:String} = 'optimism', toUInt256(10 * pow(10, 18)),
            {network:String} = 'base', toUInt256(10 * pow(10, 18)),
            {network:String} = 'arbitrum-one', toUInt256(100 * pow(10, 18)),
            {network:String} = 'bsc', toUInt256(100 * pow(10, 18)),
            {network:String} = 'avalanche', toUInt256(1000 * pow(10, 18)),
            {network:String} = 'mainnet', toUInt256(5000 * pow(10, 18)),
            {network:String} = 'polygon', toUInt256(50000 * pow(10, 18)),
            toUInt256(100 * pow(10, 18))
        )
),
/* Candidate holders: addresses that have ever been above the cutoff, capped to the slice
   the requested page can possibly need. Rank DISTINCT addresses by their peak balance —
   ranking raw rows instead would be dominated by whale balance-change history on busy chains
   and silently under-fill the candidate set. The buffer (offset*2 + 1000) covers addresses
   whose peak outranks their current balance; it scales with offset because that density grows
   with depth, keeping deep pages correct while page 1 stays cheap. The cutoff keeps this read
   tiny via the balance min-max skip index; capping the candidates makes the argMax dedup cheap. */
addresses AS (
    SELECT address FROM {db_balances:Identifier}.native_balances
    WHERE balance >= (SELECT * FROM cutoff)
    GROUP BY address
    ORDER BY max(balance) DESC, address
    LIMIT {limit:UInt64} + {offset:UInt64} * 2 + 1000
),
/* Materialize top-N balances once into a row array, then expand via arrayJoin.
   The address-array is reused to pre-filter the contracts lookup via primary key,
   avoiding the full-table hash build a plain JOIN would trigger. */
rows_arr AS (
    SELECT groupArray(tuple(address, balance, timestamp, block_num)) AS r
    FROM (
        SELECT
            address,
            argMax(balance, b.block_num) AS balance,
            max(b.timestamp) AS timestamp,
            max(block_num) AS block_num
        FROM {db_balances:Identifier}.native_balances b
        WHERE address IN (SELECT address FROM addresses)
        GROUP BY address
        ORDER BY balance DESC, address
        LIMIT {limit:UInt64} OFFSET {offset:UInt64}
    )
),
/* Chains extracted via the firehose RPC poller produce DETAILLEVEL_BASE blocks
   with no Create-call records, so the contracts table is empty. Probe once
   to decide whether is_contract can be answered. */
has_contracts AS (
    SELECT count() > 0 AS available
    FROM (SELECT 1 FROM {db_contracts:Identifier}.contracts LIMIT 1)
)
SELECT
    /* timestamps */
    t.3 AS last_update,
    t.4 AS last_update_block_num,
    toUnixTimestamp(t.3) AS last_update_timestamp,

    /* identifiers */
    t.1 AS address,

    /* amounts */
    toString(t.2) AS amount,
    t.2 / pow(10, m.decimals) AS value,

    /* holder type — null when the chain has no contract-deployment data */
    if((SELECT available FROM has_contracts),
        toBool(t.1 IN (
            SELECT address FROM {db_contracts:Identifier}.contracts
            WHERE address IN (
                SELECT arrayJoin(arrayMap(x -> x.1, (SELECT r FROM rows_arr)))
            )
        )),
        NULL
    ) AS is_contract,

    /* decimals and metadata */
    nullIf(m.name, '') AS name,
    nullIf(m.symbol, '') AS symbol,
    m.decimals AS decimals,

    /* network */
    {network:String} AS network
FROM (
    SELECT arrayJoin((SELECT r FROM rows_arr)) AS t
) AS expanded
LEFT JOIN metadata.metadata AS m FINAL ON m.network = {network:String} AND '0x0000000000000000000000000000000000000000' = m.contract
ORDER BY t.2 DESC, t.1
SETTINGS use_skip_indexes_for_top_k = 1, use_top_k_dynamic_filtering = 1
