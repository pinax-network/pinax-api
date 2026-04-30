SELECT
    user,
    sum(transactions)             AS transactions,
    sum(buys)                     AS buys,
    sum(sells)                    AS sells,
    sum(volume_bought)            AS volume_bought,
    sum(volume_sold)              AS volume_sold,
    sum(total_volume)             AS total_volume,
    sum(total_fees)               AS total_fees,
    sum(realized_pnl)             AS realized_pnl,
    sum(total_funding)            AS total_funding,
    sum(liquidation_fills)        AS liquidation_fills,
    count()                       AS coins_traded,
    min(first_trade)              AS first_trade,
    max(last_trade)               AS last_trade
FROM {db_hypercore:Identifier}.state_user_by_coin FINAL
WHERE interval_min = {interval_min:UInt32}
  AND (isNull({user:Nullable(String)}) OR user = {user:Nullable(String)})
  AND (isNull({coin:Nullable(String)}) OR coin = {coin:Nullable(String)})
  AND (isNull({dex:Nullable(String)})  OR dex  = {dex:Nullable(String)})
GROUP BY user
ORDER BY total_volume DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
