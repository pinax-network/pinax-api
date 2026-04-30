SELECT
    dex_from_coin(coin)                     AS dex,
    uniqExact(coin)                         AS assets,
    sum(side_buy_volume + side_ask_volume)  AS volume_24h,
    sum(transactions)                       AS trades_24h,
    uniqMerge(uniq_user)                    AS unique_users_24h
FROM {db_hypercore:Identifier}.state_ohlcv_fills
WHERE interval_min = 60
  AND timestamp >= now() - INTERVAL 24 HOUR
GROUP BY dex
ORDER BY volume_24h DESC

