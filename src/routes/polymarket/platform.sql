SELECT
    timestamp,
    toFloat64(sum(collateral_volume)) / 1000000. AS volume,
    toFloat64(sum(collateral_buy_volume)) / 1000000. AS buy_volume,
    toFloat64(sum(collateral_sell_volume)) / 1000000. AS sell_volume,
    sum(trades_quantity) AS trades,
    sum(buys_quantity) AS buys,
    sum(sells_quantity) AS sells,
    toFloat64(sum(net_open_interest)) / 1000000. AS net_open_interest,
    toFloat64(sum(split_amount)) / 1000000. AS split_amount,
    toFloat64(sum(merge_amount)) / 1000000. AS merge_amount,
    sum(split_count) AS split_count,
    sum(merge_count) AS merge_count,
    sum(oi_transactions) AS oi_transactions,
    toFloat64(sum(total_fee)) / 1000000. AS total_fees,
    toFloat64(sum(total_refund)) / 1000000. AS total_refunds,
    toFloat64(sum(total_fee) - sum(total_refund)) / 1000000. AS net_fees,
    sum(fee_count) AS fee_count,
    if(sum(collateral_volume) > 0, toFloat64(sum(total_fee)) / toFloat64(sum(collateral_volume)), 0) AS effective_fee_rate_gross,
    if(sum(collateral_volume) > 0, toFloat64(sum(total_fee) - sum(total_refund)) / toFloat64(sum(collateral_volume)), 0) AS effective_fee_rate
FROM {db_polymarket:Identifier}.state_platform
WHERE interval_min = {interval:UInt32}
  AND (isNull({start_time:Nullable(UInt64)}) OR timestamp >= toDateTime({start_time:Nullable(UInt64)}))
  AND (isNull({end_time:Nullable(UInt64)}) OR timestamp <= toDateTime({end_time:Nullable(UInt64)}))
GROUP BY timestamp
ORDER BY timestamp DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
