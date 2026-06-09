SELECT
    timestamp,
    ticker,
    series_from_ticker(ticker)                        AS series,
    interval_min,
    open,
    high,
    low,
    close,
    mean,
    volume_fp                                         AS volume,
    transactions,
    buy_count                                         AS buys,
    sell_count                                        AS sells
FROM {db_kalshi:Identifier}.ohlcv_trades
WHERE interval_min = {interval:UInt16}
  AND ticker = {ticker:String}
  AND (isNull({start_time:Nullable(UInt64)}) OR timestamp >= toDateTime({start_time:Nullable(UInt64)}))
  AND (isNull({end_time:Nullable(UInt64)})   OR timestamp <  toDateTime({end_time:Nullable(UInt64)}))
ORDER BY timestamp DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
