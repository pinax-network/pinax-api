WITH
/* 1) Count how many filters are active */
active_filters AS
(
    SELECT
        toUInt8(notEmpty({signature:Array(String)})) +
        toUInt8(notEmpty({amm:Array(String)})) +
        toUInt8(notEmpty({amm_pool:Array(String)})) +
        toUInt8(notEmpty({input_mint:Array(String)})) +
        toUInt8(notEmpty({output_mint:Array(String)})) +
        toUInt8(notEmpty({user:Array(String)})) +
        toUInt8(notEmpty({program_id:Array(String)})) +
        toUInt8(notEmpty({fee_payer:Array(String)})) +
        toUInt8(notEmpty({signer:Array(String)}))
    AS n
),
/* 2) Union minutes from only active filters */
minutes_union AS
(
    SELECT minute
    FROM {db_dex:Identifier}.swaps
    WHERE (notEmpty({amm:Array(String)}) AND amm IN {amm:Array(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_dex:Identifier}.swaps
    WHERE (notEmpty({amm_pool:Array(String)}) AND amm_pool IN {amm_pool:Array(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_dex:Identifier}.swaps
    WHERE (notEmpty({program_id:Array(String)}) AND program_id IN {program_id:Array(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_dex:Identifier}.swaps
    WHERE (notEmpty({input_mint:Array(String)}) AND input_mint IN {input_mint:Array(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_dex:Identifier}.swaps
    WHERE (notEmpty({output_mint:Array(String)}) AND output_mint IN {output_mint:Array(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_dex:Identifier}.swaps
    WHERE (notEmpty({user:Array(String)}) AND user IN {user:Array(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_dex:Identifier}.swaps
    WHERE (notEmpty({signature:Array(String)}) AND signature IN {signature:Array(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_dex:Identifier}.swaps
    WHERE (notEmpty({fee_payer:Array(String)}) AND fee_payer IN {fee_payer:Array(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_dex:Identifier}.swaps
    WHERE (isNotNull({protocol:Nullable(String)}) AND protocol = {protocol:Nullable(String)})
    GROUP BY minute

    UNION ALL

    SELECT minute
    FROM {db_dex:Identifier}.swaps
    WHERE (notEmpty({signer:Array(String)}) AND signer IN {signer:Array(String)})
    GROUP BY minute
),
/*
    Unified timestamp resolution for start_time/end_time and start_block/end_block.
    Uses coalesce instead of `isNull(X) OR timestamp >= (subquery)` because
    the OR pattern prevents ClickHouse from recognizing a clean primary-key range.
    greatest/least picks the tighter bound when both are provided.
    clamped_start_ts ensures the scan window is at most 1 hour wide when no filters are provided.
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
        (SELECT n FROM active_filters) > 0,
        (SELECT ts FROM start_ts),
        greatest((SELECT ts FROM start_ts), (SELECT ts FROM end_ts) - INTERVAL 1 HOUR)
    ) AS ts
),
/* 3) Intersect: keep only buckets present in ALL active filters, bounded by requested time window */
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
    SELECT
        block_num,
        timestamp,
        signature,
        transaction_index,
        instruction_index,
        stack_height,
        user,
        amm,
        amm_pool,
        signer,
        signers,
        fee_payer,
        program_id,
        input_mint,
        output_mint,
        input_amount,
        output_amount,
        fee,
        protocol,
        compute_units_consumed
    FROM {db_dex:Identifier}.swaps t
    WHERE
            ((SELECT n FROM active_filters) = 0 OR toRelativeMinuteNum(timestamp) IN (SELECT minute FROM filtered_minutes))

        /* Primary-key pruning via unified timestamp bounds from start_ts/end_ts/clamped_start_ts CTEs */
        AND timestamp >= (SELECT ts FROM clamped_start_ts)
        AND timestamp <= (SELECT ts FROM end_ts)

        /* Fine-grained block_num exclusion — only rows on the exact boundary second are checked */
        AND NOT (isNotNull({start_block:Nullable(UInt32)}) AND timestamp = (SELECT ts FROM clamped_start_ts) AND block_num < {start_block:Nullable(UInt32)})
        AND NOT (isNotNull({end_block:Nullable(UInt32)})   AND timestamp = (SELECT ts FROM end_ts)           AND block_num > {end_block:Nullable(UInt32)})

        /* Apply filters */
        AND (empty({signature:Array(String)}) OR signature IN {signature:Array(String)})
        AND (empty({program_id:Array(String)}) OR program_id IN {program_id:Array(String)})
        AND (empty({input_mint:Array(String)}) OR input_mint IN {input_mint:Array(String)})
        AND (empty({output_mint:Array(String)}) OR output_mint IN {output_mint:Array(String)})
        AND (empty({user:Array(String)}) OR user IN {user:Array(String)})
        AND (empty({amm:Array(String)}) OR amm IN {amm:Array(String)})
        AND (empty({amm_pool:Array(String)}) OR amm_pool IN {amm_pool:Array(String)})
        AND (empty({fee_payer:Array(String)}) OR fee_payer IN {fee_payer:Array(String)})
        AND (empty({signer:Array(String)}) OR signer IN {signer:Array(String)})
        AND (isNull({protocol:Nullable(String)}) OR protocol = {protocol:Nullable(String)})
    ORDER BY timestamp DESC, block_num DESC, transaction_index DESC, instruction_index DESC
    LIMIT   {limit:UInt64}
    OFFSET  {offset:UInt64}
),
mints AS (
    SELECT DISTINCT input_mint AS mint FROM filtered_swaps
    UNION DISTINCT
    SELECT DISTINCT output_mint AS mint FROM filtered_swaps
),
metadata AS
(
    SELECT mint, name, symbol, uri
    FROM {db_metadata:Identifier}.metadata
    WHERE mint IN mints
    LIMIT 1 BY mint
),
decimals AS
(
    SELECT mint, decimals
    FROM {db_accounts:Identifier}.decimals_state
    WHERE mint IN mints
    LIMIT 1 BY mint
)
SELECT
    /* block */
    block_num,
    s.timestamp AS datetime,
    toUnixTimestamp(s.timestamp) AS timestamp,

    /* transaction */
    signature,
    transaction_index,
    instruction_index,
    stack_height,
    fee_payer,
    signer,
    signers,

    /* fee */
    fee,
    compute_units_consumed,

    /* amm pool */
    program_id,
    program_names(program_id) AS program_name,
    amm,
    amm_pool,

    /* tokens */
    CAST ((
        input_mint,
        nullIf(m1.symbol, ''),
        if(d1.mint != '', d1.decimals, NULL)
    ) AS Tuple(address String, symbol Nullable(String), decimals Nullable(UInt8))) AS input_token,
    CAST ((
        output_mint,
        nullIf(m2.symbol, ''),
        if(d2.mint != '', d2.decimals, NULL)
    ) AS Tuple(address String, symbol Nullable(String), decimals Nullable(UInt8))) AS output_token,

    /* swap */
    user,
    s.input_mint AS input_mint,
    toString(s.input_amount) AS input_amount,
    if(d1.mint != '', s.input_amount / pow(10, d1.decimals), 0) AS input_value,
    s.output_mint AS output_mint,
    toString(s.output_amount) AS output_amount,
    if(d2.mint != '', s.output_amount / pow(10, d2.decimals), 0) AS output_value,

    /* prices */
    s.protocol AS protocol,


    /* summary */
    format('Swap {} {} for {} {} on {}',
        if(d1.mint != '',
            if(s.input_amount / pow(10, d1.decimals) > 1000, formatReadableQuantity(s.input_amount / pow(10, d1.decimals)), toString(s.input_amount / pow(10, d1.decimals))),
            toString(s.input_amount)),
        if(m1.mint != '', m1.symbol, s.input_mint),
        if(d2.mint != '',
            if(s.output_amount / pow(10, d2.decimals) > 1000, formatReadableQuantity(s.output_amount / pow(10, d2.decimals)), toString(s.output_amount / pow(10, d2.decimals))),
            toString(s.output_amount)),
        if(m2.mint != '', m2.symbol, s.output_mint),
        arrayStringConcat(
            arrayMap(x -> concat(upper(substring(x, 1, 1)), substring(x, 2)),
                     splitByChar('_', toString(s.protocol))),
            ' '
        )
    ) AS summary,

    /* network */
    {network:String} AS network
FROM filtered_swaps AS s
LEFT JOIN decimals AS d1 ON s.input_mint = d1.mint
LEFT JOIN decimals AS d2 ON s.output_mint = d2.mint
LEFT JOIN metadata AS m1 ON s.input_mint = m1.mint
LEFT JOIN metadata AS m2 ON s.output_mint = m2.mint
ORDER BY timestamp DESC, block_num DESC, transaction_index DESC, instruction_index DESC
