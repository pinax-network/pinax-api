WITH
    start_ts AS (
        SELECT if(
            isNotNull({start_time:Nullable(UInt64)}),
            toDateTime({start_time:Nullable(UInt64)}),
            now() - INTERVAL 24 HOUR
        ) AS t
    ),
    end_ts AS (
        SELECT if(
            isNotNull({end_time:Nullable(UInt64)}),
            toDateTime({end_time:Nullable(UInt64)}),
            now()
        ) AS t
    )
SELECT
    page.block_num                                          AS block_num,
    page.timestamp                                          AS timestamp,
    page.transaction_hash                                   AS transaction_hash,
    page.transaction_id                                     AS transaction_id,
    page.coin                                               AS coin,
    if(empty(n.market_name),
       substring(page.coin, position(page.coin, ':') + 1),
       n.market_name)                                       AS market_name,
    page.dex                                                AS dex,
    page.user                                               AS user,
    page.side                                               AS side,
    page.direction                                          AS direction,
    page.price                                              AS price,
    page.size                                               AS size,
    page.notional                                           AS notional,
    page.start_position                                     AS start_position,
    page.closed_pnl                                         AS closed_pnl,
    page.fee                                                AS fee,
    page.fee_token                                          AS fee_token,
    page.order_id                                           AS order_id,
    page.client_order_id                                    AS client_order_id,
    page.twap_id                                            AS twap_id,
    page.crossed                                            AS crossed
FROM (
    SELECT
        timestamp,
        coin,
        dex,
        user,
        side,
        direction,
        price,
        size,
        size * price          AS notional,
        start_position,
        closed_pnl_num        AS closed_pnl,
        fee,
        fee_token,
        order_id,
        client_order_id,
        twap_id,
        crossed,
        event_hash            AS transaction_hash,
        transaction_id,
        block_num,
        event_index
    FROM {db_hypercore:Identifier}.fills
    WHERE timestamp >= (SELECT t FROM start_ts)
      AND timestamp <  (SELECT t FROM end_ts)
      AND (empty({user:Array(String)})      OR user      IN {user:Array(String)})
      /* fills has no index on `user`, so a user filter scans the window (25 s for ten months). The
         (user, minute) projection gives the user's minutes instead, and the primary key selects their
         granules. When `user` is the only filter, every one of those minutes holds a matching row, so
         the newest `limit + offset` minutes are enough; with other filters, all of them are needed. */
      AND (empty({user:Array(String)}) OR toRelativeMinuteNum(timestamp) IN (
          SELECT minute
          FROM {db_hypercore:Identifier}.fills
          WHERE user IN {user:Array(String)}
            AND minute >= toRelativeMinuteNum((SELECT t FROM start_ts))
            AND minute <= toRelativeMinuteNum((SELECT t FROM end_ts))
          GROUP BY minute
          ORDER BY minute DESC
          LIMIT if(empty({coin:Array(String)}) AND empty({dex:Array(String)}) AND empty({direction:Array(String)}),
                   toUInt64({limit:UInt64}) + toUInt64({offset:UInt64}),
                   toUInt64(18446744073709551615))))
      AND (empty({coin:Array(String)})      OR coin      IN {coin:Array(String)})
      AND (empty({dex:Array(String)})       OR dex       IN {dex:Array(String)})
      AND (empty({direction:Array(String)}) OR direction IN {direction:Array(String)})
    ORDER BY timestamp DESC, block_num DESC, event_index DESC
    LIMIT {limit:UInt64}
    OFFSET {offset:UInt64}
) AS page
LEFT JOIN {db_hypercore:Identifier}.state_spot_pair_names AS n FINAL ON n.coin = page.coin
ORDER BY page.timestamp DESC, page.block_num DESC, page.event_index DESC
/* The page is read backwards along the sorting key and stops at the LIMIT; the read-ahead
   buffering of in-order reads would read far past it. */
SETTINGS read_in_order_use_buffering = 0
