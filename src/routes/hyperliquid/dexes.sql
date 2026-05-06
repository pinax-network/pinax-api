WITH
    market_aggs AS (
        SELECT
            dex_from_coin(coin)                     AS dex,
            uniqExact(coin)                         AS assets,
            sum(side_buy_volume + side_ask_volume)  AS volume_24h,
            sum(transactions)                       AS trades_24h
        FROM {db_hypercore:Identifier}.state_ohlcv_fills
        WHERE interval_min = 60
          AND timestamp >= now() - INTERVAL 24 HOUR
        GROUP BY dex
    ),
    user_aggs AS (
        SELECT
            dex,
            countDistinct(user) AS unique_users_24h
        FROM {db_hypercore:Identifier}.state_user_by_coin FINAL
        WHERE interval_min = 1440
        GROUP BY dex
    )
SELECT
    m.dex                                       AS dex,
    m.assets                                    AS assets,
    m.volume_24h                                AS volume_24h,
    m.trades_24h                                AS trades_24h,
    coalesce(u.unique_users_24h, 0)             AS unique_users_24h
FROM market_aggs m
LEFT JOIN user_aggs u USING (dex)
ORDER BY m.volume_24h DESC
