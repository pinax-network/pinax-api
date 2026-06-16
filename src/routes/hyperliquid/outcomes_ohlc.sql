WITH
    bounds AS (
        SELECT
            min(timestamp) AS start_ts,
            max(timestamp) AS end_ts
        FROM (
            SELECT timestamp
            FROM {db_hypercore:Identifier}.state_ohlcv_outcomes
            WHERE coin IN {coin:Array(String)}
              AND interval_min = {interval:UInt32}
              AND (isNull({start_time:Nullable(UInt64)}) OR timestamp >= toDateTime({start_time:Nullable(UInt64)}))
              AND (isNull({end_time:Nullable(UInt64)})   OR timestamp <  toDateTime({end_time:Nullable(UInt64)}))
            GROUP BY timestamp
            ORDER BY timestamp DESC
            LIMIT {limit:UInt64} OFFSET {offset:UInt64}
        )
    ),
    meta AS (
        SELECT
            outcome_id,
            name AS outcome_name,
            side_specs
        FROM {db_hypercore:Identifier}.state_outcome_meta FINAL
        WHERE outcome_id IN (
            SELECT intDiv(toUInt64(splitByChar('#', c)[2]), 10)
            FROM (SELECT arrayJoin({coin:Array(String)}) AS c)
        )
    )
SELECT
    candles.timestamp                                              AS timestamp,
    candles.coin                                                   AS coin,
    candles.outcome_id                                             AS outcome_id,
    candles.side_index                                             AS side_index,
    coalesce(m.side_specs[candles.side_index + 1], '')             AS side_label,
    coalesce(m.outcome_name, '')                                   AS outcome_name,
    candles.interval_min                                           AS interval_min,
    candles.open                                                   AS open,
    greatest(candles.high_quantile, candles.open, candles.close)   AS high,
    least(candles.low_quantile, candles.open, candles.close)       AS low,
    candles.close                                                  AS close,
    candles.buy_volume                                             AS buy_volume,
    candles.sell_volume                                            AS sell_volume,
    candles.gross_volume                                           AS gross_volume,
    candles.net_volume                                             AS net_volume,
    candles.transactions                                           AS transactions
FROM (
    SELECT
        t.timestamp                                                AS timestamp,
        t.coin                                                     AS coin,
        intDiv(toUInt64(splitByChar('#', t.coin)[2]), 10)          AS outcome_id,
        toUInt8(toUInt64(splitByChar('#', t.coin)[2]) % 10)        AS side_index,
        t.interval_min                                             AS interval_min,
        argMinMerge(t.open)                                        AS open,
        quantilesDeterministicMerge(0.05, 0.95)(t.quantile)[2]     AS high_quantile,
        quantilesDeterministicMerge(0.05, 0.95)(t.quantile)[1]     AS low_quantile,
        argMaxMerge(t.close)                                       AS close,
        sum(t.taker_buy_volume)                                    AS buy_volume,
        sum(t.taker_sell_volume)                                   AS sell_volume,
        sum(t.taker_buy_volume) + sum(t.taker_sell_volume)         AS gross_volume,
        sum(t.taker_buy_volume) - sum(t.taker_sell_volume)         AS net_volume,
        sum(t.transactions)                                        AS transactions
    FROM {db_hypercore:Identifier}.state_ohlcv_outcomes AS t
    WHERE t.coin IN {coin:Array(String)}
      AND t.interval_min = {interval:UInt32}
      AND t.timestamp >= (SELECT start_ts FROM bounds)
      AND t.timestamp <= (SELECT end_ts FROM bounds)
    GROUP BY t.interval_min, t.coin, t.timestamp
    SETTINGS optimize_aggregation_in_order = 1
) AS candles
LEFT JOIN meta AS m ON m.outcome_id = candles.outcome_id
ORDER BY candles.timestamp DESC, candles.coin
