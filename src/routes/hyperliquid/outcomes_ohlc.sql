WITH
    coin_parts AS (
        SELECT
            {coin:String}                                              AS coin,
            toUInt64(splitByChar('#', {coin:String})[2])               AS coin_id,
            intDiv(toUInt64(splitByChar('#', {coin:String})[2]), 10)   AS outcome_id,
            toUInt8(toUInt64(splitByChar('#', {coin:String})[2]) % 10) AS side_index
    ),
    bounds AS (
        SELECT
            min(timestamp) AS start_ts,
            max(timestamp) AS end_ts
        FROM (
            SELECT timestamp
            FROM {db_hypercore:Identifier}.state_ohlcv_outcomes
            WHERE coin = {coin:String}
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
            name                                                       AS outcome_name,
            side_specs
        FROM {db_hypercore:Identifier}.state_outcome_meta FINAL
        WHERE outcome_id = (SELECT outcome_id FROM coin_parts)
    )
SELECT
    candles.timestamp                                              AS timestamp,
    candles.coin                                                   AS coin,
    (SELECT outcome_id FROM coin_parts)                            AS outcome_id,
    (SELECT side_index FROM coin_parts)                            AS side_index,
    coalesce(m.side_specs[(SELECT side_index FROM coin_parts) + 1], '') AS side_label,
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
    candles.transactions                                           AS transactions,
    candles.buys                                                   AS buys,
    candles.sells                                                  AS sells,
    candles.total_fees                                             AS total_fees
FROM (
    SELECT
        t.timestamp                                                AS timestamp,
        t.coin                                                     AS coin,
        t.interval_min                                             AS interval_min,
        argMinMerge(t.open)                                        AS open,
        quantilesDeterministicMerge(0.05, 0.95)(t.quantile)[2]     AS high_quantile,
        quantilesDeterministicMerge(0.05, 0.95)(t.quantile)[1]     AS low_quantile,
        argMaxMerge(t.close)                                       AS close,
        sum(t.side_buy_volume)                                     AS buy_volume,
        sum(t.side_ask_volume)                                     AS sell_volume,
        sum(t.side_buy_volume) + sum(t.side_ask_volume)            AS gross_volume,
        sum(t.side_buy_volume) - sum(t.side_ask_volume)            AS net_volume,
        sum(t.transactions)                                        AS transactions,
        sum(t.buy_count)                                           AS buys,
        sum(t.sell_count)                                          AS sells,
        sum(t.total_fees)                                          AS total_fees
    FROM {db_hypercore:Identifier}.state_ohlcv_outcomes AS t
    WHERE t.coin = {coin:String}
      AND t.interval_min = {interval:UInt32}
      AND t.timestamp >= (SELECT start_ts FROM bounds)
      AND t.timestamp <= (SELECT end_ts FROM bounds)
    GROUP BY t.interval_min, t.coin, t.timestamp
    SETTINGS optimize_aggregation_in_order = 1
) AS candles
LEFT JOIN meta AS m ON 1 = 1
ORDER BY candles.timestamp DESC
