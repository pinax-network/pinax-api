SELECT
    timestamp,
    volume_fp                                         AS volume,
    mean,
    buy_count                                         AS buys,
    sell_count                                        AS sells,
    transactions                                      AS trades,
    unique_markets,
    unique_series
FROM {db_kalshi:Identifier}.ohlcv_platform
WHERE interval_min = {interval:UInt16}
  AND (isNull({start_time:Nullable(UInt64)}) OR timestamp >= toDateTime({start_time:Nullable(UInt64)}))
  AND (isNull({end_time:Nullable(UInt64)})   OR timestamp <  toDateTime({end_time:Nullable(UInt64)}))
ORDER BY timestamp DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
