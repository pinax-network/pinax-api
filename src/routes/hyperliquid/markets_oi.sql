SELECT
    oi.timestamp                                                  AS timestamp,
    oi.coin                                                       AS coin,
    any(if(empty(n.market_name), oi.coin, n.market_name))         AS market_name,
    dex_from_coin(oi.coin)                                        AS dex,
    oi.interval_min                                               AS interval_min,
    sum(oi.sum_abs_szi_observations)                              AS open_interest,
    sum(oi.sum_szi_observations)                                  AS net_position,
    sum(oi.sum_long_szi_observations)                             AS long_size,
    sum(oi.sum_short_szi_observations)                            AS short_size,
    sum(oi.long_positions)                                        AS long_positions,
    sum(oi.short_positions)                                       AS short_positions,
    avgMerge(oi.avg_funding_rate)                                 AS funding_rate,
    sum(oi.total_funding)                                         AS total_funding,
    sum(oi.positive_funding)                                      AS positive_funding,
    sum(oi.negative_funding)                                      AS negative_funding,
    sum(oi.funding_events)                                        AS funding_events
FROM {db_hypercore:Identifier}.state_open_interest AS oi
LEFT JOIN {db_hypercore:Identifier}.state_spot_pair_names AS n FINAL ON n.coin = oi.coin
WHERE oi.coin IN {coin:Array(String)}
  AND oi.interval_min = {interval:UInt32}
  AND (empty({dex:Array(String)}) OR dex_from_coin(oi.coin) IN {dex:Array(String)})
  AND (isNull({start_time:Nullable(UInt64)}) OR oi.timestamp >= toDateTime({start_time:Nullable(UInt64)}))
  AND (isNull({end_time:Nullable(UInt64)})   OR oi.timestamp <  toDateTime({end_time:Nullable(UInt64)}))
GROUP BY oi.interval_min, oi.coin, oi.timestamp
ORDER BY oi.timestamp DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
