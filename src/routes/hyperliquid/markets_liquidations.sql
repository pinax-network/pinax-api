SELECT
    any(f.timestamp)                                  AS timestamp,
    f.coin                                            AS coin,
    dex_from_coin(f.coin)                             AS dex,
    f.liquidated_user                                 AS liquidated_user,
    f.event_hash                                      AS event_hash,
    f.direction                                       AS direction,
    if(f.direction = 'AUTO_DELEVERAGING', 'AUTO_DELEVERAGING',
       replaceRegexpOne(f.direction, '^LIQUIDATED_', '')) AS liquidation_kind,
    count()                                           AS fills,
    sum(f.size)                                       AS total_size,
    sum(f.size * f.price)                             AS notional,
    sum(f.size * f.price) / sum(f.size)               AS avg_fill_price,
    any(f.mark_px)                                    AS mark_price,
    any(f.liquidation_method)                         AS liquidation_method,
    sum(f.fee)                                        AS total_fees
FROM {db_hypercore:Identifier}.fills_liquidation AS f
WHERE (f.direction LIKE 'LIQUIDATED_%' OR f.direction = 'AUTO_DELEVERAGING')
  AND (isNull({coin:Nullable(String)})            OR f.coin = {coin:Nullable(String)})
  AND (isNull({dex:Nullable(String)})             OR dex_from_coin(f.coin) = {dex:Nullable(String)})
  AND (isNull({liquidated_user:Nullable(String)}) OR f.liquidated_user = {liquidated_user:Nullable(String)})
  AND (isNull({start_time:Nullable(UInt64)})      OR f.timestamp >= toDateTime({start_time:Nullable(UInt64)}))
  AND (isNull({end_time:Nullable(UInt64)})        OR f.timestamp <  toDateTime({end_time:Nullable(UInt64)}))
GROUP BY f.event_hash, f.liquidated_user, f.coin, f.direction
ORDER BY notional DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
