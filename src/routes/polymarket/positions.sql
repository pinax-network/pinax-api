SELECT
    p.user,
    toFloat64(sum(p.buy_cost)) / 1000000. AS buy_cost,
    toFloat64(sum(p.sell_revenue)) / 1000000. AS sell_revenue,
    toFloat64(sum(p.sell_revenue) - sum(p.buy_cost)) / 1000000. AS realized_pnl,
    if(toFloat64(sum(p.net_amount)) / 1000000. > 0, toFloat64(sum(p.net_amount)) / 1000000. * coalesce(lp.close, 0), 0) AS unrealized_pnl,
    toFloat64(sum(p.sell_revenue) - sum(p.buy_cost)) / 1000000. + if(toFloat64(sum(p.net_amount)) / 1000000. > 0, toFloat64(sum(p.net_amount)) / 1000000. * coalesce(lp.close, 0), 0) AS total_pnl,
    if(sum(p.buy_cost) > 0, toFloat64(sum(p.sell_revenue) - sum(p.buy_cost)) / toFloat64(sum(p.buy_cost)), 0) AS pnl_pct,
    toFloat64(sum(p.net_amount)) / 1000000. AS net_position,
    if(toFloat64(sum(p.buy_amount)) > 0, toFloat64(sum(p.buy_cost)) / toFloat64(sum(p.buy_amount)), 0) AS avg_price,
    coalesce(lp.close, 0) AS current_price,
    toFloat64(sum(p.net_amount)) / 1000000. * coalesce(lp.close, 0) AS position_value,
    toBool(sum(p.net_amount) != 0) AS active,
    sum(p.buy_count) AS buys,
    sum(p.sell_count) AS sells,
    sum(p.transactions) AS transactions,
    CAST((nullIf(a.condition_id, ''), nullIf(a.market_slug, ''), toString(p.token_id), nullIf(a.outcome_label, ''), a.closed)
        AS Tuple(condition_id Nullable(String), market_slug Nullable(String), token_id String, outcome_label Nullable(String), closed Bool)) AS market
FROM {db_polymarket:Identifier}.state_user_position p
LEFT JOIN {db_scraper:Identifier}.polymarket_markets_by_asset_id a
    ON a.asset_id = p.token_id
LEFT JOIN {db_polymarket:Identifier}.state_latest_price lp FINAL
    ON lp.asset_id = p.token_id
WHERE p.interval_min = 1440
  AND p.user = {user:String}
  AND (isNull({token_id:Nullable(String)}) OR p.token_id = toUInt256({token_id:Nullable(String)}))
  AND (isNull({condition_id:Nullable(String)}) OR a.condition_id = {condition_id:Nullable(String)})
  AND (isNull({market_slug:Nullable(String)}) OR a.market_slug = {market_slug:Nullable(String)})
GROUP BY p.user, p.token_id, a.condition_id, a.market_slug, a.outcome_label, a.closed, lp.close
