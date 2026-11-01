
/* {cutoff:UInt256} is the network's native-token cutoff in wei, from `holders-native-cutoff` in
   dbs-config.yaml (holdersNativeCutoff()). A network without one runs evm_native_all.sql. */
WITH
/* Holders: every address with a stored balance at or above the cutoff, ranked by its latest row.
   The table keeps an address's older rows until its parts merge, so a stored balance can be at or
   above the cutoff while the latest is below it: HAVING drops those. Ranking every candidate, not a
   capped slice, keeps every page exact down to the cutoff; the cutoff keeps the candidate read
   small via the balance min-max skip index.
   Materialize the page once into a row array, then expand via arrayJoin.
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
        WHERE address IN (
            SELECT address FROM {db_balances:Identifier}.native_balances
            WHERE balance >= {cutoff:UInt256}
        )
        GROUP BY address
        HAVING balance >= {cutoff:UInt256}
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
