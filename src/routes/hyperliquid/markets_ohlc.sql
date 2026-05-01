WITH bounds AS (
    SELECT
        min(timestamp) AS start_ts,
        max(timestamp) AS end_ts
    FROM (
        SELECT timestamp
        FROM {db_hypercore:Identifier}.state_ohlcv_fills
        WHERE coin = {coin:String}
          AND interval_min = {interval:UInt32}
          AND (isNull({start_time:Nullable(UInt64)}) OR timestamp >= toDateTime({start_time:Nullable(UInt64)}))
          AND (isNull({end_time:Nullable(UInt64)})   OR timestamp <  toDateTime({end_time:Nullable(UInt64)}))
        GROUP BY timestamp
        ORDER BY timestamp DESC
        LIMIT {limit:UInt64} OFFSET {offset:UInt64}
    )
)
SELECT
    t.timestamp                                                AS timestamp,
    t.coin                                                     AS coin,
    dex_from_coin(t.coin)                                      AS dex,
    t.interval_min                                             AS interval_min,
    argMinMerge(t.open)                                        AS open,
    quantilesDeterministicMerge(0.05, 0.95)(t.quantile)[2]     AS high,
    quantilesDeterministicMerge(0.05, 0.95)(t.quantile)[1]     AS low,
    argMaxMerge(t.close)                                       AS close,
    sum(t.side_buy_volume)                                     AS buy_volume,
    sum(t.side_ask_volume)                                     AS ask_volume,
    sum(t.side_buy_volume) + sum(t.side_ask_volume)            AS gross_volume,
    sum(t.side_buy_volume) - sum(t.side_ask_volume)            AS net_volume,
    sum(t.open_long_volume)                                    AS open_long_volume,
    sum(t.close_long_volume)                                   AS close_long_volume,
    sum(t.open_short_volume)                                   AS open_short_volume,
    sum(t.close_short_volume)                                  AS close_short_volume,
    sum(t.direction_buy_volume)                                AS direction_buy_volume,
    sum(t.direction_sell_volume)                               AS direction_sell_volume,
    sum(t.transactions)                                        AS transactions,
    sum(t.buy_count)                                           AS buys,
    sum(t.sell_count)                                          AS sells,
    coalesce(any(u.uniq_user), 0)                              AS unique_users,
    sum(t.total_fees)                                          AS total_fees
FROM {db_hypercore:Identifier}.state_ohlcv_fills AS t
LEFT JOIN (
    SELECT interval_min, coin, timestamp, uniq_user
    FROM {db_hypercore:Identifier}.state_ohlcv_fills_uniq_user FINAL
    WHERE coin = {coin:String}
      AND interval_min = {interval:UInt32}
      AND timestamp >= (SELECT start_ts FROM bounds)
      AND timestamp <= (SELECT end_ts FROM bounds)
) AS u USING (interval_min, coin, timestamp)
WHERE t.coin = {coin:String}
  AND t.interval_min = {interval:UInt32}
  AND t.timestamp >= (SELECT start_ts FROM bounds)
  AND t.timestamp <= (SELECT end_ts FROM bounds)
GROUP BY t.interval_min, t.coin, t.timestamp
ORDER BY t.timestamp DESC
SETTINGS optimize_aggregation_in_order = 1
