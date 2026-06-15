WITH bounds AS (
    SELECT
        min(timestamp) AS start_ts,
        max(timestamp) AS end_ts
    FROM (
        SELECT timestamp
        FROM {db_hypercore:Identifier}.state_ohlcv_fills
        WHERE coin = {coin:String}
          AND interval_min = {interval:UInt32}
          AND (isNull({dex:Nullable(String)}) OR dex_from_coin(coin) = {dex:Nullable(String)})
          AND (isNull({start_time:Nullable(UInt64)}) OR timestamp >= toDateTime({start_time:Nullable(UInt64)}))
          AND (isNull({end_time:Nullable(UInt64)})   OR timestamp <  toDateTime({end_time:Nullable(UInt64)}))
        GROUP BY timestamp
        ORDER BY timestamp DESC
        LIMIT {limit:UInt64} OFFSET {offset:UInt64}
    )
)
SELECT
    candles.timestamp                                              AS timestamp,
    candles.coin                                                   AS coin,
    if(empty(n.market_name),
       substring(candles.coin, position(candles.coin, ':') + 1),
       n.market_name)                                              AS market_name,
    candles.dex                                                    AS dex,
    candles.interval_min                                           AS interval_min,
    candles.open                                                   AS open,
    greatest(candles.high_quantile, candles.open, candles.close)   AS high,
    least(candles.low_quantile, candles.open, candles.close)       AS low,
    candles.close                                                  AS close,
    candles.buy_volume                                             AS buy_volume,
    candles.sell_volume                                            AS sell_volume,
    candles.gross_volume                                           AS gross_volume,
    candles.net_volume                                             AS net_volume,
    candles.open_long_volume                                       AS open_long_volume,
    candles.close_long_volume                                      AS close_long_volume,
    candles.open_short_volume                                      AS open_short_volume,
    candles.close_short_volume                                     AS close_short_volume,
    candles.transactions                                           AS transactions,
    candles.unique_users                                           AS unique_users,
    candles.total_fees                                             AS total_fees
FROM (
    SELECT
        t.timestamp                                                AS timestamp,
        t.coin                                                     AS coin,
        dex_from_coin(t.coin)                                      AS dex,
        t.interval_min                                             AS interval_min,
        argMinMerge(t.open)                                        AS open,
        quantilesDeterministicMerge(0.05, 0.95)(t.quantile)[2]     AS high_quantile,
        quantilesDeterministicMerge(0.05, 0.95)(t.quantile)[1]     AS low_quantile,
        argMaxMerge(t.close)                                       AS close,
        sum(t.taker_buy_volume)                                    AS buy_volume,
        sum(t.taker_sell_volume)                                   AS sell_volume,
        sum(t.taker_buy_volume) + sum(t.taker_sell_volume)         AS gross_volume,
        sum(t.taker_buy_volume) - sum(t.taker_sell_volume)         AS net_volume,
        sum(t.open_long_volume)                                    AS open_long_volume,
        sum(t.close_long_volume)                                   AS close_long_volume,
        sum(t.open_short_volume)                                   AS open_short_volume,
        sum(t.close_short_volume)                                  AS close_short_volume,
        sum(t.transactions)                                        AS transactions,
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
    SETTINGS optimize_aggregation_in_order = 1
) AS candles
LEFT JOIN {db_hypercore:Identifier}.state_spot_pair_names AS n FINAL ON n.coin = candles.coin
ORDER BY candles.timestamp DESC
