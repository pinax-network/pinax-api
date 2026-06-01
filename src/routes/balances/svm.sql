WITH
/* Accounts CURRENTLY owned by the requested owner(s) — account only. The inner subquery
   finds every account ever associated with the owner(s) (tight lookup via the prj_owner
   projection), then argMax(owner, version) resolves each account's current owner (matching
   owner_view) and HAVING keeps only those still owned by the requested owner(s). A closed
   account (latest owner '') or one reassigned to another owner is dropped here. Referenced
   once below (the balances filter), so it streams as a normal IN-set instead of being
   materialized — no large in-memory array even for owners with millions of accounts. */
owner_accounts AS (
    SELECT account
    FROM {db_accounts:Identifier}.owner_state
    WHERE account IN (
        SELECT account
        FROM {db_accounts:Identifier}.owner_state
        WHERE owner IN {owner:Array(String)}
    )
    GROUP BY account
    HAVING argMax(owner, version) IN {owner:Array(String)}
),
/* Resolve the balance page (filters + ORDER/LIMIT) and bind it as a cached scalar so
   balances_by_account is read exactly once. Previously the `balances` CTE was inlined at
   each reference — the final SELECT plus `mints` (which feeds both `decimals` and
   `metadata`) — so balances_by_account was re-scanned ~3x. Now only the ~{limit} paged
   rows flow downstream. */
(
    SELECT groupArray((block_num, timestamp, program_id, account, amount, mint, decimals)) FROM (
        SELECT
            max(b.block_num) AS block_num,
            max(b.timestamp) AS timestamp,
            program_id,
            account,
            argMax(b.amount, b.block_num) AS amount,
            mint,
            decimals
        FROM {db_balances:Identifier}.balances_by_account AS b
        WHERE b.account IN (SELECT account FROM owner_accounts)
            AND (empty({token_account:Array(String)}) OR b.account IN {token_account:Array(String)})
            AND (empty({mint:Array(String)}) OR b.mint IN {mint:Array(String)})
            AND (isNull({program_id:Nullable(String)}) OR b.program_id = {program_id:Nullable(String)})
        GROUP BY b.account, b.program_id, b.mint, b.decimals
        HAVING {include_null_balances:Bool} OR amount > 0
        ORDER BY timestamp DESC, account, mint
        LIMIT  {limit:UInt64}
        OFFSET {offset:UInt64}
    )
) AS page_arr,
balances AS (
    SELECT
        t.1 AS block_num,
        t.2 AS timestamp,
        t.3 AS program_id,
        t.4 AS account,
        t.5 AS amount,
        t.6 AS mint,
        t.7 AS decimals
    FROM (SELECT arrayJoin(page_arr) AS t)
),
/* Owner labels for the ~{limit} returned accounts only — resolved after paging (the
   account set is tiny here), so the current-owner argMax never has to be cached for the
   owner's full account set. */
owners AS (
    SELECT account, argMax(owner, version) AS owner
    FROM {db_accounts:Identifier}.owner_state
    WHERE account IN (SELECT account FROM balances)
    GROUP BY account
    HAVING owner IN {owner:Array(String)}
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
