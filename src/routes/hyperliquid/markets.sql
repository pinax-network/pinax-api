WITH
    day_cur AS (
        SELECT
            coin,
            dex_from_coin(coin)                         AS dex,
            argMaxMerge(close)                          AS price,
            sum(side_buy_volume + side_ask_volume)      AS volume_24h,
            sum(side_buy_volume)                        AS buy_volume_24h,
            sum(side_ask_volume)                        AS ask_volume_24h,
            sum(transactions)                           AS trades_24h,
            uniqMerge(uniq_user)                        AS unique_users_24h
        FROM {db_hypercore:Identifier}.state_ohlcv_fills
        WHERE interval_min = 60
          AND timestamp >= now() - INTERVAL 24 HOUR
          AND (isNull({coin:Nullable(String)}) OR coin = {coin:Nullable(String)})
          AND (isNull({dex:Nullable(String)}) OR dex_from_coin(coin) = {dex:Nullable(String)})
        GROUP BY coin
    ),
    day_prev AS (
        SELECT
            coin,
            argMaxMerge(close) AS price_24h
        FROM {db_hypercore:Identifier}.state_ohlcv_fills
        WHERE interval_min = 60
          AND timestamp >= now() - INTERVAL 48 HOUR
          AND timestamp <  now() - INTERVAL 24 HOUR
          AND (isNull({coin:Nullable(String)}) OR coin = {coin:Nullable(String)})
          AND (isNull({dex:Nullable(String)}) OR dex_from_coin(coin) = {dex:Nullable(String)})
        GROUP BY coin
    ),
    oi_latest AS (
        SELECT
            coin,
            argMax(sum_abs_szi_observations, timestamp) AS open_interest,
            argMax(avg_funding_rate, timestamp)         AS funding_rate,
            max(timestamp)                              AS funding_snapshot_time
        FROM {db_hypercore:Identifier}.open_interest
        WHERE interval_min = 60
          AND timestamp >= now() - INTERVAL 6 HOUR
          AND (isNull({coin:Nullable(String)}) OR coin = {coin:Nullable(String)})
        GROUP BY coin
    )
SELECT
    cur.coin                                                                 AS coin,
    if(empty(n.market_name), cur.coin, n.market_name)                        AS market_name,
    cur.dex                                                                  AS dex,
    cur.price                                                                AS price,
    prev.price_24h                                                           AS price_24h,
    if(prev.price_24h > 0, (cur.price - prev.price_24h) / prev.price_24h, 0) AS price_24h_change,
    cur.volume_24h                                                           AS volume_24h,
    cur.buy_volume_24h                                                       AS buy_volume_24h,
    cur.ask_volume_24h                                                       AS ask_volume_24h,
    cur.trades_24h                                                           AS trades_24h,
    cur.unique_users_24h                                                     AS unique_users_24h,
    oi.open_interest                                                         AS open_interest,
    oi.funding_rate                                                          AS funding_rate,
    oi.funding_snapshot_time                                                 AS funding_snapshot_time
FROM day_cur cur
LEFT JOIN day_prev prev ON prev.coin = cur.coin
LEFT JOIN oi_latest oi  ON oi.coin  = cur.coin
LEFT JOIN {db_hypercore:Identifier}.state_spot_pair_names AS n FINAL ON n.coin = cur.coin
WHERE (isNull({base_token:Nullable(String)})  OR n.base_token  = {base_token:Nullable(String)})
  AND (isNull({quote_token:Nullable(String)}) OR n.quote_token = {quote_token:Nullable(String)})
ORDER BY cur.volume_24h DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
