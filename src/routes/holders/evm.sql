/* Top holders ranked by balance. The table is ORDER BY (contract, address), so a direct
   `FINAL ... ORDER BY balance DESC LIMIT N` must read every holder of the contract (tens to
   hundreds of millions of rows for popular tokens) just to sort the top N. Instead use a
   two-pass approach:

   1) candidates: grab an over-inclusive set of candidate addresses via the balance
      skip-index top-k (no FINAL, so it may surface superseded/stale balances — that's fine,
      it only over-includes). The +1000 buffer covers stale rows ranked above the requested
      page; deep pages scale it via limit+offset.
   2) rows_arr: resolve each candidate's CURRENT balance with argMax(block_num) — equivalent
      to FINAL but only over the candidate addresses — then rank and page. The result is
      materialized once into a row array (reused below for the contracts lookup) and expanded
      via arrayJoin. */
WITH candidates AS (
    SELECT address
    FROM {db_balances:Identifier}.erc20_balances
    WHERE contract = {contract:String} AND balance > 0
    ORDER BY balance DESC
    LIMIT {limit:UInt64} + {offset:UInt64} + 1000
    SETTINGS use_skip_indexes_for_top_k = 1, use_top_k_dynamic_filtering = 1
),
rows_arr AS (
    SELECT groupArray(tuple(address, amount, ts, bn)) AS r
    FROM (
        SELECT
            address,
            argMax(balance, block_num)   AS amount,
            argMax(timestamp, block_num) AS ts,
            max(block_num)               AS bn
        FROM {db_balances:Identifier}.erc20_balances
        WHERE contract = {contract:String}
          AND address IN (SELECT address FROM candidates)
        GROUP BY address
        HAVING amount > 0
        ORDER BY amount DESC, address
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
    {contract:String} AS contract,

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
LEFT JOIN metadata.metadata AS m FINAL ON m.network = {network:String} AND {contract:String} = m.contract
ORDER BY t.2 DESC, t.1
