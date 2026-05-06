SELECT
    user,
    {coin:Nullable(String)}       AS coin,
    {dex:Nullable(String)}        AS dex,
    {interval:Nullable(String)}   AS interval,
    transactions,
    buys,
    sells,
    volume_bought,
    volume_sold,
    total_volume,
    total_fees,
    realized_pnl,
    total_funding,
    liquidation_fills,
    coins_traded,
    first_trade,
    last_trade
FROM {db_hypercore:Identifier}.state_user_leaderboard FINAL
WHERE interval_min = {interval_min:UInt32}
  AND (isNull({user:Nullable(String)}) OR user = {user:Nullable(String)})
ORDER BY total_volume DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
