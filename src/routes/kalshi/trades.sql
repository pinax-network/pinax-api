SELECT
    toString(trade_id)                                AS trade_id,
    ticker,
    series,
    created_time                                      AS timestamp,
    toString(created_time_us)                         AS timestamp_us,
    toFloat64(count_fp)                               AS count,
    toFloat64(yes_price_dollars)                      AS yes_price,
    toFloat64(no_price_dollars)                       AS no_price,
    toString(taker_outcome_side)                      AS taker_outcome_side,
    toString(taker_book_side)                         AS taker_book_side
FROM {db_kalshi:Identifier}.trades
WHERE (isNull({ticker:Nullable(String)}) OR ticker = {ticker:Nullable(String)})
  AND (isNull({series:Nullable(String)}) OR series = {series:Nullable(String)})
  AND (isNull({start_time:Nullable(UInt64)}) OR created_time >= toDateTime({start_time:Nullable(UInt64)}))
  AND (isNull({end_time:Nullable(UInt64)})   OR created_time <  toDateTime({end_time:Nullable(UInt64)}))
ORDER BY created_time_us DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
