WITH balances AS
(
    SELECT
        max(b.block_num) AS block_num,
        max(b.timestamp) AS timestamp,
        account,
        argMax(b.amount, b.block_num) AS amount
    FROM {db_balances:Identifier}.native_balances AS b
    WHERE account IN {address:Array(String)}
    GROUP BY account
    HAVING {include_null_balances:Bool} OR amount > 0
    ORDER BY timestamp DESC, account ASC
    LIMIT  {limit:UInt64}
    OFFSET {offset:UInt64}
)
SELECT
    /* block */
    b.timestamp                         AS last_update,
    block_num                           AS last_update_block_num,
    toUnixTimestamp(b.timestamp) AS last_update_timestamp,

    /* token */
    '11111111111111111111111111111111' AS program_id,
    account AS address,
    'So11111111111111111111111111111111111111111' AS mint,

    /* amount */
    toString(b.amount) AS amount,
    b.amount / pow(10, 9) AS value,
    9 as decimals,

    /* metadata */
    'SOL' AS name,
    'SOL' AS symbol,
    {network:String} AS network
FROM balances AS b
ORDER BY timestamp DESC, account ASC
