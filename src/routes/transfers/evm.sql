WITH
/* 1) Count how many filters are active */
active_filters AS
(
    SELECT
        toUInt8(notEmpty({transaction_id:Array(String)})) +
        toUInt8(notEmpty({from_address:Array(String)})) +
        toUInt8(notEmpty({to_address:Array(String)})) +
        toUInt8(notEmpty({contract:Array(String)}))
    AS n
),
/* 2) Union minutes from only active filters */
minutes_union AS
(
    SELECT minute
    FROM {db_transfers:Identifier}.transfers
    WHERE (notEmpty({from_address:Array(String)}) AND `from` IN {from_address:Array(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_transfers:Identifier}.transfers
    WHERE (notEmpty({to_address:Array(String)}) AND `to` IN {to_address:Array(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_transfers:Identifier}.transfers
    WHERE (notEmpty({contract:Array(String)}) AND log_address IN {contract:Array(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_transfers:Identifier}.transfers
    WHERE (notEmpty({transaction_id:Array(String)}) AND tx_hash IN {transaction_id:Array(String)})
    GROUP BY minute
),
/*
    Unified timestamp resolution for start_time/end_time and start_block/end_block.
    Uses coalesce instead of `isNull(X) OR timestamp >= (subquery)` because
    the OR pattern prevents ClickHouse from recognizing a clean primary-key range.
    greatest/least picks the tighter bound when both are provided.
    clamped_start_ts ensures the scan window is at most 1 hour wide for bare queries.
*/
start_ts AS (
    SELECT greatest(
        coalesce(toDateTime({start_time:Nullable(UInt64)}), toDateTime(0)),
        coalesce((SELECT timestamp FROM {db_transfers:Identifier}.blocks WHERE block_num >= {start_block:Nullable(UInt64)} ORDER BY block_num ASC LIMIT 1), toDateTime(0))
    ) AS ts
),
end_ts AS (
    SELECT least(
        coalesce(toDateTime({end_time:Nullable(UInt64)}), now()),
        coalesce((SELECT timestamp FROM {db_transfers:Identifier}.blocks WHERE block_num <= {end_block:Nullable(UInt64)} ORDER BY block_num DESC LIMIT 1), now())
    ) AS ts
),
clamped_start_ts AS (
    SELECT if(
        (SELECT n FROM active_filters) > 0,
        (SELECT ts FROM start_ts),
        greatest((SELECT ts FROM start_ts), (SELECT ts FROM end_ts) - INTERVAL 1 HOUR)
    ) AS ts
),
/* 3) Intersect: keep only buckets present in ALL active filters, bounded by requested time/block window */
filtered_minutes AS
(
    SELECT minute FROM minutes_union
    WHERE minute >= toRelativeMinuteNum((SELECT ts FROM clamped_start_ts))
      AND minute <= toRelativeMinuteNum((SELECT ts FROM end_ts))
    GROUP BY minute
    HAVING count() >= (SELECT n FROM active_filters)
    ORDER BY minute DESC
    LIMIT 1 BY minute
    LIMIT if(
        (SELECT n FROM active_filters) <= 1,
        toUInt64({limit:UInt64}) + toUInt64({offset:UInt64}),           /* safe to limit if there is 1 active filter */
        (toUInt64({limit:UInt64}) + toUInt64({offset:UInt64})) * 10     /* unsafe limit with a multiplier - usually safe but find a way to early return */
    )
),
filtered_transfers AS
(
    SELECT *
    FROM {db_transfers:Identifier}.transfers t
    WHERE
            /* Scalar subquery: computed once per query, while a plain `IN (SELECT minute FROM filtered_minutes)`
               re-runs the minute pre-filter every time this CTE is inlined. */
            ((SELECT n FROM active_filters) = 0 OR minute IN (SELECT arrayJoin((SELECT groupArray(minute) FROM filtered_minutes))))

        /* Primary-key pruning via unified timestamp bounds from start_ts/end_ts/clamped_start_ts CTEs */
        AND minute >= toRelativeMinuteNum((SELECT ts FROM clamped_start_ts))
        AND minute <= toRelativeMinuteNum((SELECT ts FROM end_ts))
        AND timestamp >= (SELECT ts FROM clamped_start_ts)
        AND timestamp <= (SELECT ts FROM end_ts)

        /* Fine-grained block_num exclusion — only rows on the exact boundary second are checked */
        AND NOT (isNotNull({start_block:Nullable(UInt64)}) AND timestamp = (SELECT ts FROM clamped_start_ts) AND block_num < {start_block:Nullable(UInt64)})
        AND NOT (isNotNull({end_block:Nullable(UInt64)})   AND timestamp = (SELECT ts FROM end_ts)           AND block_num > {end_block:Nullable(UInt64)})

        AND (empty({transaction_id:Array(String)}) OR tx_hash IN {transaction_id:Array(String)})
        AND (empty({from_address:Array(String)})  OR `from` IN {from_address:Array(String)})
        AND (empty({to_address:Array(String)})    OR `to` IN {to_address:Array(String)})
        AND (empty({contract:Array(String)})      OR log_address IN {contract:Array(String)})
    ORDER BY minute DESC, timestamp DESC, block_num DESC
    LIMIT   {limit:UInt64}
    OFFSET  {offset:UInt64}
),
/*
    ClickHouse inlines a CTE at every reference. A `contracts` CTE read through `IN (SELECT contract FROM contracts)`
    re-ran filtered_transfers inside the metadata lookup (2 scans per request).
    Read through a scalar subquery, the page's contracts are collected once.
*/
page_contracts AS (
    SELECT groupUniqArray(toString(log_address)) AS contracts FROM filtered_transfers
),
contracts_metadata AS (
    SELECT
        network,
        contract,
        argMax(name, block_num) as name,
        argMax(symbol, block_num) as symbol,
        argMax(decimals, block_num) as decimals
    FROM metadata.metadata
    WHERE network = {network:String} AND contract IN (SELECT arrayJoin((SELECT contracts FROM page_contracts)))
    GROUP BY network, contract
)
SELECT
    /* block */
    t.block_num as block_num,
    t.timestamp as datetime,
    toUnixTimestamp(t.timestamp) as timestamp,

    /* transaction */
    toString(t.tx_hash) as transaction_id,

    /* log */
    log_index,
    /* log_ordinal AS ordinal, for `/v2` endpoint */
    log_address as contract,

    /* transfer */
    transfer_type as type,
    `from`,
    `to`,

    /* metadata */
    nullIf(m.name, '') AS name,
    nullIf(m.symbol, '') AS symbol,
    m.decimals AS decimals,

    /* amounts */
    toString(t.amount) AS amount,
    t.amount / pow(10, m.decimals) AS value,

    /* network */
    {network:String} AS network
FROM filtered_transfers AS t
LEFT JOIN contracts_metadata AS m ON t.log_address = m.contract
ORDER BY minute DESC, timestamp DESC, block_num DESC
