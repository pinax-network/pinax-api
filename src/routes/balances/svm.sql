WITH owners AS (
    SELECT owner, account
    FROM {db_accounts:Identifier}.owner_state AS o
    WHERE owner IN {owner:Array(String)}
),
balances AS
(
    SELECT
        max(b.block_num) AS block_num,
        max(b.timestamp) AS timestamp,
        program_id,
        account,
        argMax(b.amount, b.block_num) AS amount,
        mint,
        decimals
    FROM {db_balances:Identifier}.balances_by_account AS b
    WHERE b.account IN (SELECT account FROM owners)
        AND (empty({token_account:Array(String)}) OR b.account IN {token_account:Array(String)})
        AND (empty({mint:Array(String)}) OR b.mint IN {mint:Array(String)})
        AND (isNull({program_id:Nullable(String)}) OR b.program_id = {program_id:Nullable(String)})
    GROUP BY b.account, b.program_id, b.mint, b.decimals
    HAVING {include_null_balances:Bool} OR amount > 0
    ORDER BY timestamp DESC, account, mint
    LIMIT  {limit:UInt64}
    OFFSET {offset:UInt64}
),
mints AS (
    SELECT DISTINCT mint FROM balances
),
decimals AS (
    SELECT mint, decimals
    FROM {db_accounts:Identifier}.decimals_state
    WHERE mint IN mints
    LIMIT 1 BY mint
),
metadata AS (
    SELECT mint, name, symbol, uri
    FROM {db_metadata:Identifier}.metadata
    WHERE mint IN mints
    ORDER BY timestamp DESC
    LIMIT 1 BY mint
)
SELECT
    /* block */
    b.timestamp AS last_update,
    b.block_num AS last_update_block_num,
    toUnixTimestamp(b.timestamp) AS last_update_timestamp,

    /* balance */
    b.program_id as program_id,
    o.owner as owner,
    b.account as account,
    b.mint as mint,

    /* amount */
    toString(b.amount) AS amount,
    b.amount / pow(10, coalesce(b.decimals, d.decimals, 1)) AS value,
    coalesce(b.decimals, d.decimals) AS decimals,

    /* metadata */
    nullIf(m.name, '') AS name,
    nullIf(m.symbol, '') AS symbol,
    nullIf(m.uri, '') AS uri,

    /* network */
    {network:String} AS network
FROM balances AS b
LEFT JOIN owners AS o USING (account)
LEFT JOIN decimals AS d USING (mint)
LEFT JOIN metadata AS m USING (mint)
ORDER BY b.timestamp DESC, b.account, b.mint
