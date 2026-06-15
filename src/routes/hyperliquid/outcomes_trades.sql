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
    ),
    question_outcome_ids AS (
        SELECT arrayJoin(arrayConcat(named_outcome_ids, settled_outcome_ids, [fallback_outcome_id])) AS outcome_id
        FROM {db_hypercore:Identifier}.state_question_meta FINAL
        WHERE question_id IN (SELECT toUInt64(arrayJoin({question_id:Array(String)})))
    )
SELECT
    page.block_num                                          AS block_num,
    page.timestamp                                          AS timestamp,
    page.transaction_hash                                   AS transaction_hash,
    page.transaction_id                                     AS transaction_id,
    page.event_index                                        AS event_index,
    page.coin                                               AS coin,
    page.outcome_id                                         AS outcome_id,
    page.side_index                                         AS side_index,
    coalesce(m.side_specs[page.side_index + 1], '')         AS side_label,
    coalesce(m.outcome_name, '')                            AS outcome_name,
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
        outcome_id,
        side_index,
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
    FROM {db_hypercore:Identifier}.outcome_fills
    WHERE timestamp >= (SELECT t FROM start_ts)
      AND timestamp <  (SELECT t FROM end_ts)
      AND (empty({user:Array(String)})        OR user       IN {user:Array(String)})
      AND (empty({coin:Array(String)})        OR coin       IN {coin:Array(String)})
      AND (empty({outcome_id:Array(String)})  OR outcome_id IN (SELECT toUInt64(arrayJoin({outcome_id:Array(String)}))))
      AND (empty({question_id:Array(String)}) OR outcome_id IN (SELECT outcome_id FROM question_outcome_ids))
    ORDER BY timestamp DESC, block_num DESC, event_index DESC
    LIMIT {limit:UInt64}
    OFFSET {offset:UInt64}
) AS page
LEFT JOIN (
    SELECT outcome_id, name AS outcome_name, side_specs
    FROM {db_hypercore:Identifier}.state_outcome_meta FINAL
) AS m ON m.outcome_id = page.outcome_id
ORDER BY page.timestamp DESC, page.block_num DESC, page.event_index DESC
