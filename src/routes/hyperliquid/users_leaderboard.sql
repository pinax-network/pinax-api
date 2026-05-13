SELECT
    u.user                        AS user,
    if(length({coin:Array(String)}) = 1, {coin:Array(String)}[1], NULL) AS coin,
    if(length({dex:Array(String)})  = 1, {dex:Array(String)}[1],  NULL) AS dex,
    {interval:Nullable(String)}   AS interval,
    u.transactions                AS transactions,
    u.buys                        AS buys,
    u.sells                       AS sells,
    u.volume_bought               AS volume_bought,
    u.volume_sold                 AS volume_sold,
    u.total_volume                AS total_volume,
    u.total_fees                  AS total_fees,
    u.realized_pnl                AS realized_pnl,
    u.total_funding               AS total_funding,
    u.liquidation_fills           AS liquidation_fills,
    u.coins_traded                AS coins_traded,
    u.first_trade                 AS first_trade,
    u.last_trade                  AS last_trade
FROM {db_hypercore:Identifier}.state_user_leaderboard AS u FINAL
WHERE u.interval_min = {interval_min:UInt32}
  AND (empty({user:Array(String)}) OR u.user IN {user:Array(String)})
ORDER BY total_volume DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
