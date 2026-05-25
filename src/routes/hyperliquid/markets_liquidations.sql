SELECT
    any(f.block_num)                                            AS block_num,
    any(f.timestamp)                                            AS timestamp,
    f.event_hash                                                AS event_hash,
    f.coin                                                      AS coin,
    any(if(empty(n.market_name),
           substring(f.coin, position(f.coin, ':') + 1),
           n.market_name))                                      AS market_name,
    dex_from_coin(f.coin)                                       AS dex,
    f.liquidated_user                                           AS liquidated_user,
    f.direction                                                 AS direction,
    if(f.direction = 'AUTO_DELEVERAGING', 'AUTO_DELEVERAGING',
       replaceRegexpOne(f.direction, '^LIQUIDATED_', ''))       AS liquidation_kind,
    count()                                                     AS fills,
    sum(f.size)                                                 AS total_size,
    sum(f.size * f.price)                                       AS notional,
    sum(f.size * f.price) / sum(f.size)                         AS avg_fill_price,
    any(f.mark_px)                                              AS mark_price,
    any(f.liquidation_method)                                   AS liquidation_method,
    sum(f.fee)                                                  AS total_fees
FROM {db_hypercore:Identifier}.fills_liquidation AS f
LEFT JOIN {db_hypercore:Identifier}.state_spot_pair_names AS n FINAL ON n.coin = f.coin
WHERE f.user = f.liquidated_user
  AND (empty({coin:Array(String)})            OR f.coin IN {coin:Array(String)})
  AND (empty({dex:Array(String)})             OR dex_from_coin(f.coin) IN {dex:Array(String)})
  AND (empty({liquidated_user:Array(String)}) OR f.liquidated_user IN {liquidated_user:Array(String)})
  AND (isNull({start_time:Nullable(UInt64)})      OR f.timestamp >= toDateTime({start_time:Nullable(UInt64)}))
  AND (isNull({end_time:Nullable(UInt64)})        OR f.timestamp <  toDateTime({end_time:Nullable(UInt64)}))
GROUP BY f.event_hash, f.liquidated_user, f.coin, f.direction
ORDER BY notional DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
