/*
    Unified timestamp + block_num resolution.
    Uses coalesce instead of `isNull(X) OR timestamp >= (subquery)` because
    the OR pattern prevents ClickHouse from recognizing a clean primary-key range,
    causing a full scan. With coalesce, ClickHouse always sees direct bounds,
    enabling granule skipping on the primary index.
    When no lower bound → falls back to epoch (toDateTime(0)) → no-op.
    When no upper bound → falls back to now() → no-op.
/* Only clamp to 1 hour when no narrowing filters are active.
   start_time/start_block are already incorporated into start_ts, so the
   clamp's greatest() handles them correctly without disabling it. */

    NOTE: block_num filtering is limited — unlike swaps/transfers, the NFT database
    has no `blocks` table to resolve block_num → timestamp, so block filters are applied
    as secondary WHERE clauses after the timestamp clamp. This means block-only queries
    are constrained to the 10-minute window. For accurate wide-range block_num filtering,
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
/* Only skip the 10-minute safety clamp when the caller has provided BOTH
   narrowing filters AND an explicit lower bound (start_time or start_block).
   Without a lower bound, start_ts = epoch → ClickHouse scans the entire table.
   Unlike EVM transfers/swaps, the NFT database has no `minute` column or
   `minutes_union` pre-filtering, so the clamp is the only scan limiter. */
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
erc721 AS (
    SELECT
        CASE
            WHEN from IN (
                '0x0000000000000000000000000000000000000000',
                '0x000000000000000000000000000000000000dead'
            ) THEN 'MINT'
            WHEN to IN (
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
        from,
        to,
        toString(token_id) AS token_id,
        amount,
        transfer_type,
        token_standard
    FROM {db_nft:Identifier}.erc721_transfers AS t
    WHERE timestamp >= (SELECT ts FROM clamped_start_ts) AND timestamp <= (SELECT ts FROM end_ts)
        AND (isNull({start_block:Nullable(UInt64)}) OR block_num >= {start_block:Nullable(UInt64)})
        AND (isNull({end_block:Nullable(UInt64)}) OR block_num <= {end_block:Nullable(UInt64)})
        AND (isNull({type:Nullable(String)}) OR `@type` = {type:Nullable(String)})
        AND (empty({transaction_id:Array(String)}) OR tx_hash IN {transaction_id:Array(String)})
        AND (empty({contract:Array(String)}) OR contract IN {contract:Array(String)})
        AND (empty({token_id:Array(String)}) OR token_id IN {token_id:Array(String)})
        AND (empty({address:Array(String)}) OR (from IN {address:Array(String)} OR to IN {address:Array(String)}))
        AND (empty({from_address:Array(String)}) OR from IN {from_address:Array(String)})
        AND (empty({to_address:Array(String)}) OR to IN {to_address:Array(String)})
),
erc1155 AS (
    SELECT
        CASE
            WHEN from IN (
                '0x0000000000000000000000000000000000000000',
                '0x000000000000000000000000000000000000dead'
            ) THEN 'MINT'
            WHEN to IN (
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
        from,
        to,
        toString(token_id) AS token_id,
        amount,
        transfer_type,
        token_standard
    FROM {db_nft:Identifier}.erc1155_transfers AS t
    WHERE timestamp >= (SELECT ts FROM clamped_start_ts) AND timestamp <= (SELECT ts FROM end_ts)
        AND (isNull({start_block:Nullable(UInt64)}) OR block_num >= {start_block:Nullable(UInt64)})
        AND (isNull({end_block:Nullable(UInt64)}) OR block_num <= {end_block:Nullable(UInt64)})
        AND (empty({transaction_id:Array(String)}) OR tx_hash IN {transaction_id:Array(String)})
        AND (empty({contract:Array(String)}) OR contract IN {contract:Array(String)})
        AND (empty({token_id:Array(String)}) OR token_id IN {token_id:Array(String)})
        AND (empty({address:Array(String)}) OR (from IN {address:Array(String)} OR to IN {address:Array(String)}))
        AND (empty({from_address:Array(String)}) OR from IN {from_address:Array(String)})
        AND (empty({to_address:Array(String)}) OR to IN {to_address:Array(String)})
),
combined AS (
    SELECT * FROM erc721
    UNION ALL
    SELECT * FROM erc1155
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
    from,
    to,
    toString(amount) AS amount,
    {network:String} as network
FROM limit_combined AS c
LEFT JOIN erc721_metadata_by_contract AS m USING (contract)
LEFT JOIN erc1155_metadata_by_contract AS m2 USING (contract)
ORDER BY c.timestamp DESC
