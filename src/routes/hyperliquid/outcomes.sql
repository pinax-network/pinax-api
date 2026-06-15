WITH
    meta AS (
        SELECT outcome_id, question_id, name, description, side_specs, quote_token,
               status, settle_fraction, settle_details
        FROM {db_hypercore:Identifier}.state_outcome_meta FINAL
        WHERE (empty({outcome_id:Array(String)})   OR outcome_id  IN (SELECT toUInt64(arrayJoin({outcome_id:Array(String)}))))
          AND (empty({question_id:Array(String)})  OR question_id IN (SELECT toUInt64(arrayJoin({question_id:Array(String)}))))
          AND ({status:String} = 'all' OR status = {status:String})
          AND (isNull({quote_token:Nullable(String)}) OR quote_token = {quote_token:Nullable(String)})
    ),
    rollup AS (
        SELECT
            intDiv(toUInt64(splitByChar('#', coin)[2]), 10) AS outcome_id,
            sum(taker_buy_volume + taker_sell_volume)       AS volume_24h,
            sum(transactions)                               AS trades_24h,
            max(max_timestamp)                              AS last_trade
        FROM {db_hypercore:Identifier}.state_ohlcv_outcomes
        WHERE interval_min = 60
          AND timestamp >= now() - INTERVAL 24 HOUR
        GROUP BY coin
    ),
    rollup_agg AS (
        SELECT outcome_id,
               sum(volume_24h)               AS volume_24h,
               sum(trades_24h)               AS trades_24h,
               toNullable(max(last_trade))   AS last_trade
        FROM rollup
        GROUP BY outcome_id
    ),
    price_yes AS (
        SELECT
            intDiv(toUInt64(splitByChar('#', coin)[2]), 10) AS outcome_id,
            toNullable(argMaxMerge(close))                  AS price_yes
        FROM {db_hypercore:Identifier}.state_ohlcv_outcomes
        WHERE interval_min = 60
          AND (toUInt64(splitByChar('#', coin)[2]) % 10) = 0
          AND timestamp >= now() - INTERVAL 24 HOUR
        GROUP BY coin
    ),
    questions AS (
        SELECT question_id, name, description, fallback_outcome_id,
               named_outcome_ids, settled_outcome_ids
        FROM {db_hypercore:Identifier}.state_question_meta FINAL
        WHERE question_id IN (SELECT question_id FROM meta WHERE question_id IS NOT NULL)
    )
SELECT
    m.outcome_id                                                          AS outcome_id,
    m.name                                                                AS name,
    m.description                                                         AS description,
    m.side_specs                                                          AS side_specs,
    m.status                                                              AS status,
    m.quote_token                                                         AS quote_token,
    m.settle_fraction                                                     AS settle_fraction,
    m.settle_details                                                      AS settle_details,
    CAST(
        arrayMap(
            i -> (
                CAST(m.side_specs[i + 1] AS String),
                concat('#', toString(m.outcome_id * 10 + i)),
                toUInt8(i)
            ),
            range(0, length(m.side_specs))
        )
        AS Array(Tuple(label String, coin String, side_index UInt8))
    )                                                                     AS sides,
    py.price_yes                                                          AS price_yes,
    coalesce(r.volume_24h, 0)                                             AS volume_24h,
    coalesce(r.trades_24h, 0)                                             AS trades_24h,
    r.last_trade                                                          AS last_trade,
    CAST(
        (
            m.question_id,
            nullIf(q.name, ''),
            nullIf(q.description, ''),
            q.fallback_outcome_id,
            q.named_outcome_ids,
            q.settled_outcome_ids
        )
        AS Tuple(
            question_id Nullable(UInt64),
            name Nullable(String),
            description Nullable(String),
            fallback_outcome_id Nullable(UInt64),
            named_outcome_ids Array(UInt64),
            settled_outcome_ids Array(UInt64)
        )
    )                                                                     AS question
FROM meta AS m
LEFT JOIN rollup_agg AS r USING (outcome_id)
LEFT JOIN price_yes  AS py USING (outcome_id)
LEFT JOIN questions  AS q ON q.question_id = m.question_id
ORDER BY
    if({sort_by:String} = 'volume_24h', coalesce(r.volume_24h, 0), 0)     DESC,
    if({sort_by:String} = 'outcome_id', -toInt64(m.outcome_id), 0)        DESC,
    if({sort_by:String} = 'last_trade', toUnixTimestamp(r.last_trade), 0) DESC,
    m.outcome_id ASC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
