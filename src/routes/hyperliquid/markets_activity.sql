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
    block_num
FROM {db_hypercore:Identifier}.fills
WHERE timestamp >= (SELECT t FROM start_ts)
  AND timestamp <  (SELECT t FROM end_ts)
  AND (isNull({user:Nullable(String)}) OR user = {user:Nullable(String)})
  AND (isNull({coin:Nullable(String)}) OR coin = {coin:Nullable(String)})
  AND (isNull({dex:Nullable(String)})  OR dex  = {dex:Nullable(String)})
ORDER BY timestamp DESC, block_num DESC, event_index DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
