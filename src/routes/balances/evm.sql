WITH filtered_balances AS (
    SELECT
        max(block_num) AS block_num,
        max(timestamp) AS timestamp,
        address,
        contract,
        argMax(balance, b.timestamp) AS amount
    FROM {db_balances:Identifier}.erc20_balances AS b
    WHERE
        address IN {address:Array(String)}
        AND (empty({contract:Array(String)}) OR contract IN {contract:Array(String)})
        AND (balance > 0 OR {include_null_balances:Bool})
    GROUP BY address, contract
    ORDER BY block_num DESC, address, contract
    LIMIT   {limit:UInt64}
    OFFSET  {offset:UInt64}
),
meta AS (
    /* metadata.metadata is ORDER BY (network, contract); filter on both columns
       so the primary key prunes the scan to the handful of contracts that
       actually appear in the LIMIT'd balances window, instead of scanning the
       entire network prefix via the previous JOIN-only condition. */
    SELECT
        contract,
        argMax(name,     block_num) AS name,
        argMax(symbol,   block_num) AS symbol,
        argMax(decimals, block_num) AS decimals
    FROM metadata.metadata
    WHERE network = {network:String}
      AND contract IN (SELECT contract FROM filtered_balances)
    GROUP BY contract
)
SELECT
    /* block */
    a.timestamp AS last_update,
    a.block_num AS last_update_block_num,
    toUnixTimestamp(a.timestamp) AS last_update_timestamp,

    /* identity */
    a.address AS address,
    a.contract AS contract,

    /* amounts */
    toString(a.amount) AS amount,
    a.amount / pow(10, m.decimals) AS value,

    /* metadata */
    nullIf(m.name, '') AS name,
    nullIf(m.symbol, '') AS symbol,
    m.decimals AS decimals,

    /* network */
    {network:String} AS network
FROM filtered_balances AS a
LEFT JOIN meta AS m ON m.contract = a.contract
ORDER BY a.block_num DESC, a.address, a.contract
