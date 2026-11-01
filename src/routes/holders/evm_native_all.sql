
/* Cutoff 0 (holdersNativeCutoff(), src/config/dbsConfig.ts): rank every address with a positive
   balance. FINAL keeps each address's latest row (highest block_num) and streams in
   address order, so memory stays small, but every request reads the whole table. The SETTINGS
   below keep FINAL from skipping granules by balance, which would skip nothing at this cutoff
   and could hide an address's latest row behind an older, higher one. */
WITH
/* Materialize the page once into a row array, then expand via arrayJoin.
   The address-array is reused to pre-filter the contracts lookup via primary key,
   avoiding the full-table hash build a plain JOIN would trigger. */
rows_arr AS (
    SELECT groupArray(tuple(address, balance, timestamp, block_num)) AS r
    FROM (
        SELECT address, balance, timestamp, block_num
        FROM {db_balances:Identifier}.native_balances FINAL
        WHERE balance > 0
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
SETTINGS use_skip_indexes_if_final = 0, use_skip_indexes_for_top_k = 0, use_top_k_dynamic_filtering = 0
