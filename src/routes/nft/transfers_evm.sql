/*
    NFT transfers (ERC-721 + ERC-1155).

    Table layout (both erc721_transfers and erc1155_transfers):
      ORDER BY (timestamp, block_num, index)
      bloom_filter skip indexes on tx_hash, contract, `from`, `to`

    Unlike the ERC-20 transfers / swaps tables there is no `minute` column and no
    per-minute projections, so the `minutes_union` pre-filter used there cannot be
    applied here. Instead this query leans on two things the NFT tables do support:

      1. Reverse primary-key reads. The final `ORDER BY timestamp DESC LIMIT` is
         pushed through the UNION ALL, so every branch reads the table backwards
         in PK order and stops as soon as enough rows match. (Do NOT add per-branch
         LIMITs or re-reference `limit_combined` from other CTEs: ClickHouse inlines
         CTEs at each use, which multiplies the scan.)

      2. Bloom-filter skip indexes. A skip index can only prune when the column
         predicate is AND-ed into the WHERE clause. `from IN x OR to IN x` defeats
         both idx_from and idx_to (76% of granules survive on mainnet), so the
         `address` filter is split into two branches per table:
           - from-branch: `from` IN address            (uses idx_from)
           - to-branch:   `to` IN address AND `from` NOT IN address  (uses idx_to)
         The NOT IN guard makes the branches disjoint, so no dedup is needed.
         When `address` is not provided the to-branch's `notEmpty(...)` folds to
         false and the branch reads nothing.

    Unified timestamp + block_num resolution uses coalesce instead of
    `isNull(X) OR timestamp >= (subquery)` because the OR pattern prevents
    ClickHouse from recognizing a clean primary-key range.

    NOTE: block_num filtering is limited. The NFT database has no `blocks` table to
    resolve block_num -> timestamp, so block filters are applied as secondary WHERE
    clauses after the timestamp clamp. For accurate wide-range block_num filtering,
    a blocks table needs to be added to the NFT substreams:
    https://github.com/pinax-network/substreams-evm/issues/175
*/
WITH
start_ts AS (
    SELECT coalesce(toDateTime({start_time:Nullable(UInt64)}), toDateTime(0)) AS ts
),
end_ts AS (
    SELECT coalesce(toDateTime({end_time:Nullable(UInt64)}), now()) AS ts
),
has_filters AS (
    SELECT (
        isNotNull({type:Nullable(String)})
        OR notEmpty({transaction_id:Array(String)}) OR notEmpty({contract:Array(String)})
        OR notEmpty({token_id:Array(String)}) OR notEmpty({address:Array(String)})
        OR notEmpty({from_address:Array(String)}) OR notEmpty({to_address:Array(String)})
    ) AS yes
),
/* Only skip the 1-hour safety clamp when the caller has provided narrowing
   filters or an explicit lower bound (start_time or start_block). Without either,
   start_ts = epoch and a bare query would scan the entire table. */
has_explicit_start AS (
    SELECT (isNotNull({start_time:Nullable(UInt64)}) OR isNotNull({start_block:Nullable(UInt64)})) AS yes
),
clamped_start_ts AS (
    SELECT if(
        (SELECT yes FROM has_filters) OR (SELECT yes FROM has_explicit_start),
        (SELECT ts FROM start_ts),
        greatest((SELECT ts FROM start_ts), (SELECT ts FROM end_ts) - INTERVAL 1 HOUR)
    ) AS ts
),
/* ---- ERC-721: from-branch (also the only branch when `address` is empty) ---- */
erc721_from AS (
    SELECT
        CASE
            WHEN `from` IN (
                '0x0000000000000000000000000000000000000000',
                '0x000000000000000000000000000000000000dead'
            ) THEN 'MINT'
            WHEN `to` IN (
                '0x0000000000000000000000000000000000000000',
                '0x000000000000000000000000000000000000dead'
            ) THEN 'BURN'
            ELSE 'TRANSFER'
        END AS "@type",
        block_num,
        block_hash,
        timestamp,
        tx_hash,
        contract,
        `from`,
        `to`,
        toString(token_id) AS token_id,
        amount,
        transfer_type,
        token_standard
    FROM {db_nft:Identifier}.erc721_transfers
    WHERE timestamp >= (SELECT ts FROM clamped_start_ts) AND timestamp <= (SELECT ts FROM end_ts)
        AND (isNull({start_block:Nullable(UInt64)}) OR block_num >= {start_block:Nullable(UInt64)})
        AND (isNull({end_block:Nullable(UInt64)}) OR block_num <= {end_block:Nullable(UInt64)})
        AND (isNull({type:Nullable(String)}) OR `@type` = {type:Nullable(String)})
        AND (empty({transaction_id:Array(String)}) OR tx_hash IN {transaction_id:Array(String)})
        AND (empty({contract:Array(String)}) OR contract IN {contract:Array(String)})
        AND (empty({token_id:Array(String)}) OR token_id IN {token_id:Array(String)})
        AND (empty({address:Array(String)}) OR `from` IN {address:Array(String)})
        AND (empty({from_address:Array(String)}) OR `from` IN {from_address:Array(String)})
        AND (empty({to_address:Array(String)}) OR `to` IN {to_address:Array(String)})
),
/* ---- ERC-721: to-branch (only active when `address` is provided) ---- */
erc721_to AS (
    SELECT
        CASE
            WHEN `from` IN (
                '0x0000000000000000000000000000000000000000',
                '0x000000000000000000000000000000000000dead'
            ) THEN 'MINT'
            WHEN `to` IN (
                '0x0000000000000000000000000000000000000000',
                '0x000000000000000000000000000000000000dead'
            ) THEN 'BURN'
            ELSE 'TRANSFER'
        END AS "@type",
        block_num,
        block_hash,
        timestamp,
        tx_hash,
        contract,
        `from`,
        `to`,
        toString(token_id) AS token_id,
        amount,
        transfer_type,
        token_standard
    FROM {db_nft:Identifier}.erc721_transfers
    WHERE notEmpty({address:Array(String)})
        AND `to` IN {address:Array(String)}
        AND `from` NOT IN {address:Array(String)}
        AND timestamp >= (SELECT ts FROM clamped_start_ts) AND timestamp <= (SELECT ts FROM end_ts)
        AND (isNull({start_block:Nullable(UInt64)}) OR block_num >= {start_block:Nullable(UInt64)})
        AND (isNull({end_block:Nullable(UInt64)}) OR block_num <= {end_block:Nullable(UInt64)})
        AND (isNull({type:Nullable(String)}) OR `@type` = {type:Nullable(String)})
        AND (empty({transaction_id:Array(String)}) OR tx_hash IN {transaction_id:Array(String)})
        AND (empty({contract:Array(String)}) OR contract IN {contract:Array(String)})
        AND (empty({token_id:Array(String)}) OR token_id IN {token_id:Array(String)})
        AND (empty({from_address:Array(String)}) OR `from` IN {from_address:Array(String)})
        AND (empty({to_address:Array(String)}) OR `to` IN {to_address:Array(String)})
),
/* ---- ERC-1155: from-branch ---- */
erc1155_from AS (
    SELECT
        CASE
            WHEN `from` IN (
                '0x0000000000000000000000000000000000000000',
                '0x000000000000000000000000000000000000dead'
            ) THEN 'MINT'
            WHEN `to` IN (
                '0x0000000000000000000000000000000000000000',
                '0x000000000000000000000000000000000000dead'
            ) THEN 'BURN'
            ELSE 'TRANSFER'
        END AS "@type",
        block_num,
        block_hash,
        timestamp,
        tx_hash,
        contract,
        `from`,
        `to`,
        toString(token_id) AS token_id,
        amount,
        transfer_type,
        token_standard
    FROM {db_nft:Identifier}.erc1155_transfers
    WHERE timestamp >= (SELECT ts FROM clamped_start_ts) AND timestamp <= (SELECT ts FROM end_ts)
        AND (isNull({start_block:Nullable(UInt64)}) OR block_num >= {start_block:Nullable(UInt64)})
        AND (isNull({end_block:Nullable(UInt64)}) OR block_num <= {end_block:Nullable(UInt64)})
        AND (isNull({type:Nullable(String)}) OR `@type` = {type:Nullable(String)})
        AND (empty({transaction_id:Array(String)}) OR tx_hash IN {transaction_id:Array(String)})
        AND (empty({contract:Array(String)}) OR contract IN {contract:Array(String)})
        AND (empty({token_id:Array(String)}) OR token_id IN {token_id:Array(String)})
        AND (empty({address:Array(String)}) OR `from` IN {address:Array(String)})
        AND (empty({from_address:Array(String)}) OR `from` IN {from_address:Array(String)})
        AND (empty({to_address:Array(String)}) OR `to` IN {to_address:Array(String)})
),
/* ---- ERC-1155: to-branch ---- */
erc1155_to AS (
    SELECT
        CASE
            WHEN `from` IN (
                '0x0000000000000000000000000000000000000000',
                '0x000000000000000000000000000000000000dead'
            ) THEN 'MINT'
            WHEN `to` IN (
                '0x0000000000000000000000000000000000000000',
                '0x000000000000000000000000000000000000dead'
            ) THEN 'BURN'
            ELSE 'TRANSFER'
        END AS "@type",
        block_num,
        block_hash,
        timestamp,
        tx_hash,
        contract,
        `from`,
        `to`,
        toString(token_id) AS token_id,
        amount,
        transfer_type,
        token_standard
    FROM {db_nft:Identifier}.erc1155_transfers
    WHERE notEmpty({address:Array(String)})
        AND `to` IN {address:Array(String)}
        AND `from` NOT IN {address:Array(String)}
        AND timestamp >= (SELECT ts FROM clamped_start_ts) AND timestamp <= (SELECT ts FROM end_ts)
        AND (isNull({start_block:Nullable(UInt64)}) OR block_num >= {start_block:Nullable(UInt64)})
        AND (isNull({end_block:Nullable(UInt64)}) OR block_num <= {end_block:Nullable(UInt64)})
        AND (isNull({type:Nullable(String)}) OR `@type` = {type:Nullable(String)})
        AND (empty({transaction_id:Array(String)}) OR tx_hash IN {transaction_id:Array(String)})
        AND (empty({contract:Array(String)}) OR contract IN {contract:Array(String)})
        AND (empty({token_id:Array(String)}) OR token_id IN {token_id:Array(String)})
        AND (empty({from_address:Array(String)}) OR `from` IN {from_address:Array(String)})
        AND (empty({to_address:Array(String)}) OR `to` IN {to_address:Array(String)})
),
combined AS (
    SELECT * FROM erc721_from
    UNION ALL
    SELECT * FROM erc721_to
    UNION ALL
    SELECT * FROM erc1155_from
    UNION ALL
    SELECT * FROM erc1155_to
),
limit_combined AS (
    SELECT *
    FROM combined
    ORDER BY timestamp DESC
    LIMIT {limit:UInt64}
    OFFSET {offset:UInt64}
),
erc721_metadata_by_contract AS (
    SELECT
        contract,
        any(name) AS name,
        any(symbol) AS symbol
    FROM {db_nft:Identifier}.erc721_metadata_by_contract
    WHERE (empty({contract:Array(String)}) OR contract IN {contract:Array(String)})
    GROUP BY contract
),
erc1155_metadata_by_contract AS (
    SELECT
        contract,
        any(name) AS name,
        any(symbol) AS symbol
    FROM {db_nft:Identifier}.erc1155_metadata_by_contract
    WHERE (empty({contract:Array(String)}) OR contract IN {contract:Array(String)})
    GROUP BY contract
)
SELECT
    c.block_num,
    c.timestamp AS datetime,
    toUnixTimestamp(c.timestamp) AS timestamp,
    `@type`,
    transfer_type,
    tx_hash AS transaction_id,
    contract,
    toString(token_id) AS token_id,
    if(length(m.name) > 0, m.name, m2.name) AS name,
    if(length(m.symbol) > 0, m.symbol, m2.symbol) AS symbol,
    token_standard,
    `from`,
    `to`,
    toString(amount) AS amount,
    {network:String} as network
FROM limit_combined AS c
LEFT JOIN erc721_metadata_by_contract AS m USING (contract)
LEFT JOIN erc1155_metadata_by_contract AS m2 USING (contract)
ORDER BY c.timestamp DESC
