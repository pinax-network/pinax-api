WITH
/* 1) Count how many filters are active */
active_filters AS
(
    SELECT
        toUInt8(notEmpty({transaction_id:Array(String)}))  +
        toUInt8(notEmpty({factory:Array(String)}))         +
        toUInt8(notEmpty({pool:Array(String)}))            +
        toUInt8(notEmpty({user:Array(String)}))            +
        toUInt8(notEmpty({recipient:Array(String)}))       +
        toUInt8(notEmpty({sender:Array(String)}))          +
        toUInt8(notEmpty({caller:Array(String)}))          +
        toUInt8(notEmpty({transaction_from:Array(String)})) +
        toUInt8(notEmpty({input_contract:Array(String)}))  +
        toUInt8(notEmpty({output_contract:Array(String)})) +
        toUInt8(isNotNull({protocol:Nullable(String)}))
    AS n
),
/* 2) Union minutes from only active filters */
minutes_union AS
(
    SELECT minute
    FROM {db_dex:Identifier}.swaps
    WHERE (notEmpty({transaction_id:Array(String)}) AND tx_hash IN {transaction_id:Array(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_dex:Identifier}.swaps
    WHERE (notEmpty({caller:Array(String)}) AND call_caller IN {caller:Array(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_dex:Identifier}.swaps
    WHERE (notEmpty({transaction_from:Array(String)}) AND tx_from IN {transaction_from:Array(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_dex:Identifier}.swaps
    WHERE (notEmpty({factory:Array(String)}) AND factory IN {factory:Array(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_dex:Identifier}.swaps
    WHERE (notEmpty({pool:Array(String)}) AND pool IN {pool:Array(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_dex:Identifier}.swaps
    WHERE (notEmpty({user:Array(String)}) AND user IN {user:Array(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_dex:Identifier}.swaps
    WHERE (notEmpty({recipient:Array(String)}) AND user IN {recipient:Array(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_dex:Identifier}.swaps
    WHERE (notEmpty({sender:Array(String)}) AND tx_from IN {sender:Array(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_dex:Identifier}.swaps
    WHERE (notEmpty({input_contract:Array(String)}) AND input_contract IN {input_contract:Array(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_dex:Identifier}.swaps
    WHERE (notEmpty({output_contract:Array(String)}) AND output_contract IN {output_contract:Array(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_dex:Identifier}.swaps
    WHERE (isNotNull({protocol:Nullable(String)}) AND protocol = {protocol:Nullable(String)})
    GROUP BY minute
),
/*
    Unified timestamp resolution for start_time/end_time and start_block/end_block.
    Uses coalesce instead of `isNull(X) OR timestamp >= (subquery)` because
    the OR pattern prevents ClickHouse from recognizing a clean primary-key range.
    greatest/least picks the tighter bound when both are provided.
    clamped_start_ts ensures the scan window is at most 1 hour wide.
*/
start_ts AS (
    SELECT greatest(
        coalesce(toDateTime({start_time:Nullable(UInt64)}), toDateTime(0)),
        coalesce((SELECT timestamp FROM {db_dex:Identifier}.blocks WHERE block_num >= {start_block:Nullable(UInt64)} ORDER BY block_num ASC LIMIT 1), toDateTime(0))
    ) AS ts
),
end_ts AS (
    SELECT least(
        coalesce(toDateTime({end_time:Nullable(UInt64)}), now()),
        coalesce((SELECT timestamp FROM {db_dex:Identifier}.blocks WHERE block_num <= {end_block:Nullable(UInt64)} ORDER BY block_num DESC LIMIT 1), now())
    ) AS ts
),
clamped_start_ts AS (
    SELECT if(
        (SELECT n FROM active_filters) > 0 OR isNotNull({start_time:Nullable(UInt64)}) OR isNotNull({start_block:Nullable(UInt64)}),
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
filtered_swaps AS
(
    SELECT *
    FROM {db_dex:Identifier}.swaps

    WHERE
            ((SELECT n FROM active_filters) = 0 OR minute IN (SELECT minute FROM filtered_minutes))

        /* Primary-key pruning via unified timestamp bounds from start_ts/end_ts CTEs */
        AND minute >= toRelativeMinuteNum((SELECT ts FROM clamped_start_ts))
        AND minute <= toRelativeMinuteNum((SELECT ts FROM end_ts))
        AND timestamp >= (SELECT ts FROM clamped_start_ts)
        AND timestamp <= (SELECT ts FROM end_ts)

        /* Fine-grained block_num exclusion — only rows on the exact boundary second are checked */
        AND NOT (isNotNull({start_block:Nullable(UInt64)}) AND timestamp = (SELECT ts FROM clamped_start_ts) AND block_num < {start_block:Nullable(UInt64)})
        AND NOT (isNotNull({end_block:Nullable(UInt64)})   AND timestamp = (SELECT ts FROM end_ts)           AND block_num > {end_block:Nullable(UInt64)})

        AND (empty({transaction_id:Array(String)})      OR tx_hash IN {transaction_id:Array(String)})
        AND (empty({factory:Array(String)})             OR factory IN {factory:Array(String)})
        AND (empty({pool:Array(String)})                OR pool IN {pool:Array(String)})
        AND (empty({user:Array(String)})                OR user IN {user:Array(String)})
        AND (empty({recipient:Array(String)})           OR user IN {recipient:Array(String)})
        AND (empty({sender:Array(String)})              OR tx_from IN {sender:Array(String)})
        AND (empty({caller:Array(String)})              OR call_caller IN {caller:Array(String)})
        AND (empty({transaction_from:Array(String)})    OR tx_from IN {transaction_from:Array(String)})
        AND (
            empty({input_contract:Array(String)})
            OR if(protocol = 'uniswap_v3', output_contract, input_contract) IN {input_contract:Array(String)}
        )
        AND (
            empty({output_contract:Array(String)})
            OR if(protocol = 'uniswap_v3', input_contract, output_contract) IN {output_contract:Array(String)}
        )
        AND (isNull({protocol:Nullable(String)})        OR protocol = {protocol:Nullable(String)})

        /* kyber_elastic shares the Uniswap V3 swap event signature, so substreams emits a
           duplicate row for every v3 swap labeled 'kyber_elastic' (identical tx_hash,
           log_index, log_ordinal, pool, amounts). Drop kyber_elastic until the substreams
           decoder disambiguates.
           Tracked at https://github.com/pinax-network/substreams-evm */
        AND protocol != 'kyber_elastic'
    ORDER BY minute DESC, timestamp DESC, block_num DESC
    LIMIT   {limit:UInt64}
    OFFSET  {offset:UInt64}
),
/* --- HOTFIX: reverse input/output for uniswap_v3 (remove when fixed upstream) --- */
oriented_swaps AS (
    SELECT * REPLACE (
        if(protocol = 'uniswap_v3', output_contract, input_contract) AS input_contract,
        if(protocol = 'uniswap_v3', input_contract,  output_contract) AS output_contract,
        if(protocol = 'uniswap_v3', output_amount,   input_amount)   AS input_amount,
        if(protocol = 'uniswap_v3', input_amount,     output_amount) AS output_amount
    )
    FROM filtered_swaps
),
/* --- END HOTFIX --- */
contracts AS (
    SELECT DISTINCT input_contract AS contract FROM oriented_swaps
    UNION DISTINCT
    SELECT DISTINCT output_contract AS contract FROM oriented_swaps
),
contracts_metadata AS (
    SELECT
        network,
        contract,
        argMax(name, block_num) as name,
        argMax(symbol, block_num) as symbol,
        argMax(decimals, block_num) as decimals
    FROM metadata.metadata
    WHERE network = {network:String} AND contract IN (SELECT contract FROM contracts)
    GROUP BY network, contract
)
SELECT
    /* block */
    s.block_num AS block_num,
    s.timestamp AS datetime,
    toUnixTimestamp(s.timestamp) AS timestamp,

    /* transaction */
    s.tx_hash AS transaction_id,
    s.tx_index AS transaction_index,
    s.tx_from AS transaction_from,
    s.call_index AS call_index,

    /* log */
    s.log_index AS log_index,
    s.log_ordinal AS log_ordinal,
    s.log_block_index AS log_block_index,
    s.log_topic0 AS log_topic0,

    /* swap */
    toString(s.factory) AS factory,
    s.pool AS pool,
    s.call_caller AS caller,
    s.user AS user,
    s.tx_from AS sender,
    s.user AS recipient,

    /* tokens */
    CAST ((
        s.input_contract,
        m1.symbol,
        m1.decimals
    ) AS Tuple(address String, symbol String, decimals UInt8)) AS input_token,
    CAST ((
        s.output_contract,
        m2.symbol,
        m2.decimals
    ) AS Tuple(address String, symbol String, decimals UInt8)) AS output_token,

    /* amounts and prices */
    toString(s.input_amount) AS input_amount,
    s.input_amount / pow(10, m1.decimals) AS input_value,
    toString(s.output_amount) AS output_amount,
    s.output_amount / pow(10, m2.decimals) AS output_value,
    if(s.input_amount > 0, (s.output_amount / pow(10, m2.decimals)) / (s.input_amount / pow(10, m1.decimals)), 0) AS price,
    if(s.output_amount > 0, (s.input_amount / pow(10, m1.decimals)) / (s.output_amount / pow(10, m2.decimals)), 0) AS price_inv,
    s.protocol AS protocol,

    /* summary */
    format('Swap {} {} for {} {} on {}',
        if(s.input_amount / pow(10, m1.decimals) > 1000, formatReadableQuantity(s.input_amount / pow(10, m1.decimals)), toString(s.input_amount / pow(10, m1.decimals))),
        m1.symbol,
        if(s.output_amount / pow(10, m2.decimals) > 1000, formatReadableQuantity(s.output_amount / pow(10, m2.decimals)), toString(s.output_amount / pow(10, m2.decimals))),
        m2.symbol,
        arrayStringConcat(
            arrayMap(x -> concat(upper(substring(x, 1, 1)), substring(x, 2)),
                     splitByChar('_', toString(s.protocol))),
            ' '
        )
    ) AS summary,

    /* network */
    {network:String} AS network
FROM oriented_swaps AS s
LEFT JOIN contracts_metadata AS m1 ON s.input_contract = m1.contract
LEFT JOIN contracts_metadata AS m2 ON s.output_contract = m2.contract
ORDER BY minute DESC, timestamp DESC, block_num DESC
