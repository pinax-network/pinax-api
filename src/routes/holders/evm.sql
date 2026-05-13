/* Materialize top-N balances once into a row array, then expand via arrayJoin.
   The address-array is reused to pre-filter the contracts lookup via primary key,
   avoiding the full-table hash build a plain JOIN would trigger. */
WITH rows_arr AS (
    SELECT groupArray(tuple(address, balance, timestamp, block_num)) AS r
    FROM (
        SELECT address, balance, timestamp, block_num
        FROM {db_balances:Identifier}.erc20_balances FINAL
        WHERE contract = {contract:String} AND balance > 0
        ORDER BY balance DESC, address
        LIMIT {limit:UInt64} OFFSET {offset:UInt64}
    )
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

    /* holder type */
    toBool(t.1 IN (
        SELECT address FROM {db_contracts:Identifier}.contracts
        WHERE address IN (
            SELECT arrayJoin(arrayMap(x -> x.1, (SELECT r FROM rows_arr)))
        )
    )) AS is_contract,

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
