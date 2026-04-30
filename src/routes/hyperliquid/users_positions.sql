SELECT
    user,
    coin,
    dex_from_coin(coin)              AS dex,
    argMax(szi, event_time)          AS position_size,
    argMax(funding_rate, event_time) AS funding_rate,
    max(event_time)                  AS last_update
FROM {db_hypercore:Identifier}.funding_deltas
WHERE timestamp >= now() - INTERVAL 2 DAY
  AND user = {user:String}
  AND (isNull({coin:Nullable(String)}) OR coin = {coin:Nullable(String)})
  AND (isNull({dex:Nullable(String)})  OR dex  = {dex:Nullable(String)})
GROUP BY user, coin
HAVING position_size != 0
ORDER BY abs(position_size) DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
