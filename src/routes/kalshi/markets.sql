SELECT
    m.ticker                                          AS ticker,
    m.series                                          AS series,
    m.event_ticker                                    AS event_ticker,
    nullIf(m.mve_collection_ticker, '')               AS mve_collection_ticker,
    m.market_type                                     AS market_type,
    m.status                                          AS status,
    m.title                                           AS title,
    m.created_time                                    AS created_time,
    m.close_time                                      AS close_time,
    m.updated_time                                    AS updated_time,
    m.result                                          AS result,
    toFloat64OrNull(m.settlement_value_dollars)       AS settlement_value,
    /* toFloat64OrNull is a no-op once substreams-kalshi ships the column as
       Nullable(Float64); kept here so the API works against both the current
       String column and the upcoming numeric one. */
    toFloat64OrNull(toString(m.expiration_value))     AS expiration_value,
    toFloat64(m.yes_bid_dollars)                      AS yes_bid,
    toFloat64(m.yes_ask_dollars)                      AS yes_ask,
    toFloat64(m.no_bid_dollars)                       AS no_bid,
    toFloat64(m.no_ask_dollars)                       AS no_ask,
    toFloat64(m.last_price_dollars)                   AS last_price,
    toFloat64(m.volume_fp)                            AS volume,
    toFloat64(m.volume_24h_fp)                        AS volume_24h,
    toFloat64(m.open_interest_fp)                     AS open_interest,
    toFloat64(m.notional_value_dollars)               AS notional_value
FROM {db_kalshi:Identifier}.markets AS m FINAL
WHERE (isNull({ticker:Nullable(String)})       OR m.ticker = {ticker:Nullable(String)})
  AND (isNull({series:Nullable(String)})       OR m.series = {series:Nullable(String)})
  AND (isNull({event_ticker:Nullable(String)}) OR m.event_ticker = {event_ticker:Nullable(String)})
  AND (isNull({status:Nullable(String)})       OR m.status = {status:Nullable(String)})
ORDER BY m.updated_time DESC, m.ticker
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
