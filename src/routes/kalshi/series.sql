/* Series leaderboard rollup. Reads the finest-grained (1m) bars of the
   state_ohlcv_trades_by_series MV so the SUM is exact for any time-range —
   coarser intervals (60m, 1440m) would over-count when the user-supplied
   start_time/end_time bisects a bar. */
SELECT
    series,
    uniqMerge(ticker_set)                                    AS market_count,
    sum(volume_fp)                                           AS volume,
    sum(transactions)                                        AS trades,
    sum(buy_count)                                           AS buys,
    sum(sell_count)                                          AS sells,
    min(min_timestamp)                                       AS first_trade,
    max(max_timestamp)                                       AS last_trade
FROM {db_kalshi:Identifier}.state_ohlcv_trades_by_series
WHERE interval_min = 1
  AND (isNull({series:Nullable(String)}) OR series = {series:Nullable(String)})
  AND (isNull({start_time:Nullable(UInt64)}) OR timestamp >= toDateTime({start_time:Nullable(UInt64)}))
  AND (isNull({end_time:Nullable(UInt64)})   OR timestamp <  toDateTime({end_time:Nullable(UInt64)}))
GROUP BY series
ORDER BY volume DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
SETTINGS optimize_aggregation_in_order = 1
