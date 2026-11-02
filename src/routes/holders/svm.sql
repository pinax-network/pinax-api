WITH metadata AS (
    SELECT mint, name, symbol, uri
    FROM {db_metadata:Identifier}.metadata
    WHERE mint = {mint:String}
    ORDER BY timestamp DESC
    LIMIT 1
),
/* balances_holders keeps a mint's top 10,000 holders by amount, closed accounts included: an
   account closed in the transaction that emptied it has no post-balance, so `balances` keeps its
   last positive amount (pinax-network/substreams-svm#240). Every candidate costs a point lookup in
   close_account_state (about 3 ms), so the candidates are read in two rounds, each bound as a
   cached scalar array so that its lookups run exactly once. Round 1 takes ten candidates per
   requested row, at least 100 and at most 1,000, in the page's order, which is the view's key, so
   the read stops at the LIMIT and equal amounts cut the same way on every page. Round 2 runs only
   when round 1 holds fewer open accounts than the page needs and was smaller than 1,000: it takes
   the former 1,000 candidates, so no page is shorter than before. A page of 10 of a mint with up
   to 90% closed candidates costs 100 lookups instead of 1,000 (wSOL: 81% of its top 100 and 88% of
   its top 1,000 on 2026-11-02). */
candidates_1 AS (
    SELECT account, block_num, timestamp, program_id, mint, amount, decimals
    FROM {db_balances:Identifier}.balances_holders
    WHERE mint = {mint:String}
    ORDER BY amount DESC, account
    LIMIT least(1000, greatest(100, 10 * (toUInt64({limit:UInt64}) + toUInt64({offset:UInt64}))))
),
(
    SELECT groupArray((account, block_num, timestamp, program_id, amount, decimals)) FROM (
        SELECT b.account, b.block_num, b.timestamp, b.program_id, b.amount, b.decimals
        FROM candidates_1 AS b
        LEFT JOIN (
            SELECT account, closed
            FROM {db_accounts:Identifier}.close_account_view
            WHERE account IN (SELECT account FROM candidates_1)
        ) AS c USING (account)
        WHERE c.closed IS NULL OR c.closed = false
    )
) AS open_1,
(
    length(open_1) < toUInt64({limit:UInt64}) + toUInt64({offset:UInt64})
    AND toUInt64({limit:UInt64}) + toUInt64({offset:UInt64}) < 100
) AS round_2,
/* `AND round_2` is a constant once open_1 is known: when false, nothing below is read. */
candidates_2 AS (
    SELECT account, block_num, timestamp, program_id, mint, amount, decimals
    FROM {db_balances:Identifier}.balances_holders
    WHERE mint = {mint:String} AND round_2
    ORDER BY amount DESC, account
    LIMIT 1000
),
(
    SELECT groupArray((account, block_num, timestamp, program_id, amount, decimals)) FROM (
        SELECT b.account, b.block_num, b.timestamp, b.program_id, b.amount, b.decimals
        FROM candidates_2 AS b
        LEFT JOIN (
            SELECT account, closed
            FROM {db_accounts:Identifier}.close_account_view
            WHERE account IN (SELECT account FROM candidates_2)
        ) AS c USING (account)
        WHERE c.closed IS NULL OR c.closed = false
    )
) AS open_2,
/* The page: the open candidates of the round that fills it, in the page's order. `owner` is a
   display-only column, so the owner_view lookup, which aggregates the 8.9B-row owner_state, then
   only needs the returned accounts. */
(
    SELECT groupArray(r) FROM (
        SELECT r
        FROM (SELECT arrayJoin(if(round_2, open_2, open_1)) AS r)
        ORDER BY r.5 DESC, r.1
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
