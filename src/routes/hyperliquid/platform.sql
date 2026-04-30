WITH
    top_ts AS (
        SELECT timestamp
        FROM {db_hypercore:Identifier}.state_platform
        WHERE interval_min = {interval:UInt32}
          AND (isNull({start_time:Nullable(UInt64)}) OR timestamp >= toDateTime({start_time:Nullable(UInt64)}))
          AND (isNull({end_time:Nullable(UInt64)})   OR timestamp <  toDateTime({end_time:Nullable(UInt64)}))
        GROUP BY timestamp
        ORDER BY timestamp DESC
        LIMIT {limit:UInt64}
        OFFSET {offset:UInt64}
    ),
    sums AS (
        SELECT
            timestamp,
            sum(side_buy_volume + side_ask_volume)            AS volume,
            sum(side_buy_volume)                              AS buy_volume,
            sum(side_ask_volume)                              AS ask_volume,
            sum(transactions)                                 AS transactions,
            sum(buys)                                         AS buys,
            sum(sells)                                        AS sells,
            sum(total_fees)                                   AS total_fees,
            sum(liq_side_buy_volume + liq_side_ask_volume)    AS liquidations_volume,
            sum(liq_transactions)                             AS liquidations_count
        FROM {db_hypercore:Identifier}.state_platform
        WHERE interval_min = {interval:UInt32}
          AND timestamp IN top_ts
        GROUP BY timestamp
    ),
    active AS (
        SELECT timestamp, uniqExact(coin) AS active_coins
        FROM {db_hypercore:Identifier}.state_ohlcv_fills
        WHERE interval_min = {interval:UInt32}
          AND timestamp IN top_ts
        GROUP BY timestamp
    ),
    liq_uniq AS (
        SELECT timestamp, sum(uniq_liquidated_user) AS unique_liquidated_users
        FROM {db_hypercore:Identifier}.state_ohlcv_liquidation_uniq_user FINAL
        WHERE interval_min = {interval:UInt32}
          AND timestamp IN top_ts
        GROUP BY timestamp
    )
SELECT
    sums.timestamp                                      AS timestamp,
    {interval:UInt32}                                   AS interval_min,
    sums.volume                                         AS volume,
    sums.buy_volume                                     AS buy_volume,
    sums.ask_volume                                     AS ask_volume,
    sums.transactions                                   AS transactions,
    sums.buys                                           AS buys,
    sums.sells                                          AS sells,
    coalesce(active.active_coins, 0)                    AS active_coins,
    sums.total_fees                                     AS total_fees,
    sums.liquidations_volume                            AS liquidations_volume,
    sums.liquidations_count                             AS liquidations_count,
    coalesce(liq_uniq.unique_liquidated_users, 0)       AS unique_liquidated_users
FROM sums
LEFT JOIN active   USING (timestamp)
LEFT JOIN liq_uniq USING (timestamp)
ORDER BY sums.timestamp DESC
