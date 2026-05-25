WITH
    day_cur AS (
        SELECT
            coin,
            dex_from_coin(coin)                         AS dex,
            argMaxMerge(close)                          AS price,
            sum(side_buy_volume + side_ask_volume)      AS volume_24h,
            sum(side_ask_volume)                        AS buy_volume_24h,
            sum(side_buy_volume)                        AS sell_volume_24h,
            sum(transactions)                           AS trades_24h
        FROM {db_hypercore:Identifier}.state_ohlcv_fills
        WHERE interval_min = 60
          AND timestamp >= now() - INTERVAL 24 HOUR
          AND (empty({coin:Array(String)}) OR coin IN {coin:Array(String)})
          AND (empty({dex:Array(String)})  OR dex_from_coin(coin) IN {dex:Array(String)})
        GROUP BY coin
    ),
    uu_24h AS (
        SELECT
            coin,
            argMax(uniq_user, timestamp)                AS unique_users_24h
        FROM {db_hypercore:Identifier}.state_ohlcv_fills_uniq_user FINAL
        WHERE interval_min = 1440
          AND timestamp >= now() - INTERVAL 48 HOUR
          AND (empty({coin:Array(String)}) OR coin IN {coin:Array(String)})
          AND (empty({dex:Array(String)})  OR dex_from_coin(coin) IN {dex:Array(String)})
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
          AND (empty({coin:Array(String)}) OR coin IN {coin:Array(String)})
          AND (empty({dex:Array(String)})  OR dex_from_coin(coin) IN {dex:Array(String)})
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
          AND (empty({coin:Array(String)}) OR coin IN {coin:Array(String)})
        GROUP BY coin
    )
SELECT
    coin,
    market_name,
    dex,
    base_token,
    quote_token,
    price,
    price_24h,
    price_24h_change,
    volume_24h,
    buy_volume_24h,
    sell_volume_24h,
    trades_24h,
    unique_users_24h,
    open_interest,
    funding_rate,
    funding_snapshot_time
FROM (
    SELECT
        cur.coin                                                                 AS coin,
        if(empty(n.market_name),
           substring(cur.coin, position(cur.coin, ':') + 1),
           n.market_name)                                                        AS market_name,
        cur.dex                                                                  AS dex,
        if(empty(n.base_token),
           if(startsWith(cur.coin, '#'),
              NULL,
              substring(cur.coin, position(cur.coin, ':') + 1)),
           n.base_token)                                                         AS base_token,
        if(empty(n.quote_token),
           if(startsWith(cur.coin, '#'), NULL, 'USDC'),
           n.quote_token)                                                        AS quote_token,
        cur.price                                                                AS price,
        prev.price_24h                                                           AS price_24h,
        if(prev.price_24h > 0, (cur.price - prev.price_24h) / prev.price_24h, 0) AS price_24h_change,
        cur.volume_24h                                                           AS volume_24h,
        cur.buy_volume_24h                                                       AS buy_volume_24h,
        cur.sell_volume_24h                                                      AS sell_volume_24h,
        cur.trades_24h                                                           AS trades_24h,
        coalesce(uu.unique_users_24h, 0)                                         AS unique_users_24h,
        oi.open_interest                                                         AS open_interest,
        oi.funding_rate                                                          AS funding_rate,
        oi.funding_snapshot_time                                                 AS funding_snapshot_time
    FROM day_cur cur
    LEFT JOIN day_prev prev ON prev.coin = cur.coin
    LEFT JOIN oi_latest oi  ON oi.coin  = cur.coin
    LEFT JOIN uu_24h     uu ON uu.coin  = cur.coin
    LEFT JOIN {db_hypercore:Identifier}.state_spot_pair_names AS n FINAL ON n.coin = cur.coin
)
WHERE (empty({base_token:Array(String)})  OR base_token  IN {base_token:Array(String)})
  AND (empty({quote_token:Array(String)}) OR quote_token IN {quote_token:Array(String)})
ORDER BY volume_24h DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
