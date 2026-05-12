SELECT
    o.timestamp AS timestamp,
    o.open,
    o.high,
    o.low,
    o.close,
    o.scaled_collateral_volume AS volume,
    o.trades_quantity AS trades,
    o.buys_quantity AS buys,
    o.sells_quantity AS sells,
    o.unique_makers,
    o.unique_takers,
    f.scaled_total_fee AS total_fees,
    f.scaled_total_refund AS total_refunds,
    f.scaled_net_fee AS net_fees,
    f.fee_count,
    f.effective_fee_rate_gross,
    f.effective_fee_rate_net AS effective_fee_rate,
    CAST((nullIf(a.condition_id, ''), nullIf(a.market_slug, ''), toString(o.asset_id), nullIf(a.outcome_label, ''), a.closed)
        AS Tuple(condition_id Nullable(String), market_slug Nullable(String), token_id String, outcome_label Nullable(String), closed Bool)) AS market
FROM {db_polymarket:Identifier}.orderbook o
LEFT JOIN {db_polymarket:Identifier}.fee f
    ON f.asset_id = o.asset_id AND f.timestamp = o.timestamp AND f.interval_min = o.interval_min
LEFT JOIN {db_scraper:Identifier}.polymarket_markets_by_asset_id a
    ON a.asset_id = o.asset_id
WHERE o.interval_min = {interval:UInt32}
  AND o.asset_id = toUInt256({token_id:String})
  AND (isNull({start_time:Nullable(UInt64)}) OR o.timestamp >= toDateTime({start_time:Nullable(UInt64)}))
  AND (isNull({end_time:Nullable(UInt64)}) OR o.timestamp <= toDateTime({end_time:Nullable(UInt64)}))
ORDER BY o.timestamp DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
