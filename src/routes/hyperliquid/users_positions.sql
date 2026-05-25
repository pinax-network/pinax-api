SELECT
    f.user                                                  AS user,
    f.coin                                                  AS coin,
    any(if(empty(n.market_name),
           substring(f.coin, position(f.coin, ':') + 1),
           n.market_name))                                  AS market_name,
    dex_from_coin(f.coin)                                   AS dex,
    argMax(f.szi, f.event_time)                             AS position_size,
    argMax(f.funding_rate, f.event_time)                    AS funding_rate,
    max(f.event_time)                                       AS last_update
FROM {db_hypercore:Identifier}.funding_deltas AS f
LEFT JOIN {db_hypercore:Identifier}.state_spot_pair_names AS n FINAL ON n.coin = f.coin
WHERE f.timestamp >= now() - INTERVAL 2 DAY
  AND f.user IN {user:Array(String)}
  AND (empty({coin:Array(String)}) OR f.coin IN {coin:Array(String)})
  AND (empty({dex:Array(String)})  OR f.dex  IN {dex:Array(String)})
GROUP BY f.user, f.coin
HAVING position_size != 0
ORDER BY abs(position_size) DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
