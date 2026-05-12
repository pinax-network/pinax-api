SELECT
    user,
    buy_count AS buys,
    sell_count AS sells,
    transactions,
    buy_cost AS volume_bought,
    sell_revenue AS volume_sold,
    buy_cost + sell_revenue AS total_volume,
    realized_pnl,
    unrealized_pnl,
    total_pnl,
    first_trade,
    last_trade
FROM {db_polymarket:Identifier}.state_user FINAL
WHERE interval_min = {interval_min:UInt32}
  AND (empty({user:Array(String)}) OR user IN {user:Array(String)})
