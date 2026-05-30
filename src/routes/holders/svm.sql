WITH metadata AS (
    SELECT mint, name, symbol, uri
    FROM {db_metadata:Identifier}.metadata
    WHERE mint = {mint:String}
    LIMIT 1
),
balances AS (
    SELECT account, block_num, timestamp, program_id, mint, amount, decimals
    FROM {db_balances:Identifier}.balances_holders
    WHERE mint = {mint:String}
    LIMIT 1000
),
close_accounts AS (
    SELECT account, closed
    FROM {db_accounts:Identifier}.close_account_view
    WHERE account IN (SELECT account FROM balances)
),
/* Resolve the page (closed-account filter + ORDER/LIMIT) BEFORE looking up owners,
   and bind it as a cached scalar array so the close_account_view aggregation runs
   exactly once. `owner` is a display-only column (never filtered or ordered on), so
   the owner_view lookup — which aggregates the 7.5B-row owner_state — then only needs
   the ~{limit} returned accounts instead of all 1000 holder candidates. */
(
    SELECT groupArray((account, block_num, timestamp, program_id, amount, decimals)) FROM (
        SELECT b.account, b.block_num, b.timestamp, b.program_id, b.amount, b.decimals
        FROM balances AS b
        LEFT JOIN close_accounts AS c USING (account)
        WHERE c.closed IS NULL OR c.closed = false
        ORDER BY b.amount DESC, b.account
        LIMIT {limit:UInt64}
        OFFSET {offset:UInt64}
    )
) AS page_arr,
page AS (
    SELECT
        r.1 AS account,
        r.2 AS block_num,
        r.3 AS timestamp,
        r.4 AS program_id,
        r.5 AS amount,
        r.6 AS decimals
    FROM (SELECT arrayJoin(page_arr) AS r)
),
owners AS (
    SELECT account, owner
    FROM {db_accounts:Identifier}.owner_view
    WHERE account IN (SELECT account FROM page)
)
SELECT
    /* block */
    b.timestamp AS last_update,
    b.block_num AS last_update_block_num,
    toUnixTimestamp(b.timestamp) AS last_update_timestamp,

    /* token */
    b.program_id AS program_id,
    {mint:String} AS mint,

    /* token account */
    b.account AS token_account,
    o.owner AS owner,

    /* amount */
    toString(b.amount) AS amount,
    b.amount / pow(10, b.decimals) AS value,
    b.decimals AS decimals,

    /* metadata */
    nullIf(m.name, '') AS name,
    nullIf(m.symbol, '') AS symbol,
    nullIf(m.uri, '') AS uri,

    /* network */
    {network:String} as network
FROM page b
LEFT JOIN metadata m ON m.mint = {mint:String}
LEFT JOIN owners o USING (account)
ORDER BY b.amount DESC, b.account
