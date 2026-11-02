WITH metadata AS (
    SELECT mint, name, symbol, uri
    FROM {db_metadata:Identifier}.metadata
    WHERE mint = {mint:String}
    ORDER BY timestamp DESC
    LIMIT 1
),
/* The page is the holders view's top rows, nothing else. balances_holders holds the top 10,000
   holders per mint from `balances FINAL WHERE amount > 0`, refreshed hourly. Since svm-balances
   v0.3.5 (pinax-network/substreams-svm#241) the sink writes a zero balance when a token account
   is closed, and the accounts closed before that release were migrated to zero on 2026-11-02, so
   the view no longer lists closed accounts and the per-request close_account_view lookup that
   this query used to make (1,000 point lookups into a 9 B-row table, about 2 s) is gone. An
   account closed since the last refresh stays in the view until the next one, like any balance
   that changed since.

   The page is bound as a cached scalar array so that the owner lookup below, which aggregates
   the 7.5 B-row owner_state, runs for the ~{limit} returned accounts only. `owner` is a
   display-only column, never filtered or ordered on. */
(
    SELECT groupArray((account, block_num, timestamp, program_id, amount, decimals)) FROM (
        SELECT account, block_num, timestamp, program_id, amount, decimals
        FROM {db_balances:Identifier}.balances_holders
        WHERE mint = {mint:String}
        ORDER BY amount DESC, account
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
