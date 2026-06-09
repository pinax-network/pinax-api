SELECT
    l.ticker                                          AS ticker,
    series_from_ticker(l.ticker)                      AS series,
    l.kind,
    l.ts                                              AS timestamp,
    l.status,
    l.result,
    toFloat64OrNull(l.settlement_value_dollars)       AS settlement_value,
    nullIf(l.mve_collection_ticker, '')               AS mve_collection_ticker
FROM {db_kalshi:Identifier}.market_lifecycle AS l
WHERE (isNull({ticker:Nullable(String)}) OR l.ticker = {ticker:Nullable(String)})
  AND (isNull({series:Nullable(String)}) OR series_from_ticker(l.ticker) = {series:Nullable(String)})
  AND (isNull({start_time:Nullable(UInt64)}) OR l.ts >= toDateTime({start_time:Nullable(UInt64)}))
  AND (isNull({end_time:Nullable(UInt64)})   OR l.ts <  toDateTime({end_time:Nullable(UInt64)}))
ORDER BY l.ts DESC, l.ticker
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
