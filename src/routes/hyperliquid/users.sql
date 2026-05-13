SELECT
    u.user                        AS user,
    if(length({coin:Array(String)}) = 1, {coin:Array(String)}[1], NULL) AS coin,
    if(length({dex:Array(String)})  = 1, {dex:Array(String)}[1],  NULL) AS dex,
    {interval:Nullable(String)}   AS interval,
    sum(u.transactions)           AS transactions,
    sum(u.buys)                   AS buys,
    sum(u.sells)                  AS sells,
    sum(u.volume_bought)          AS volume_bought,
    sum(u.volume_sold)            AS volume_sold,
    sum(u.total_volume)           AS total_volume,
    sum(u.total_fees)             AS total_fees,
    sum(u.realized_pnl)           AS realized_pnl,
    sum(u.total_funding)          AS total_funding,
    sum(u.liquidation_fills)      AS liquidation_fills,
    count()                       AS coins_traded,
    min(u.first_trade)            AS first_trade,
    max(u.last_trade)             AS last_trade
FROM {db_hypercore:Identifier}.state_user_by_coin AS u FINAL
WHERE u.interval_min = {interval_min:UInt32}
  AND (empty({user:Array(String)}) OR u.user IN {user:Array(String)})
  AND (empty({coin:Array(String)}) OR u.coin IN {coin:Array(String)})
  AND (empty({dex:Array(String)})  OR u.dex  IN {dex:Array(String)})
GROUP BY u.user
ORDER BY total_volume DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
