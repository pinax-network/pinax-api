WITH
    question_outcome_ids AS (
        SELECT arrayJoin(arrayConcat(named_outcome_ids, settled_outcome_ids, [fallback_outcome_id])) AS outcome_id
        FROM {db_hypercore:Identifier}.state_question_meta FINAL
        WHERE question_id IN (SELECT toUInt64(arrayJoin({question_id:Array(String)})))
    ),
    rows AS (
        SELECT
            user,
            intDiv(toUInt64(splitByChar('#', coin)[2]), 10) AS outcome_id,
            transactions,
            buys,
            sells,
            volume_bought,
            volume_sold,
            total_volume,
            total_fees,
            realized_pnl,
            first_trade,
            last_trade
        FROM {db_hypercore:Identifier}.state_user_by_coin FINAL
        WHERE dex = 'outcome'
          AND interval_min = {interval_min:UInt32}
          AND user IN {user:Array(String)}
    )
SELECT
    r.user                                                   AS user,
    r.outcome_id                                             AS outcome_id,
    coalesce(m.name, '')                                     AS outcome_name,
    coalesce(m.status, '')                                   AS status,
    coalesce(m.side_specs, [])                               AS side_specs,
    sum(r.transactions)                                      AS transactions,
    sum(r.buys)                                              AS buys,
    sum(r.sells)                                             AS sells,
    sum(r.volume_bought)                                     AS volume_bought,
    sum(r.volume_sold)                                       AS volume_sold,
    sum(r.total_volume)                                      AS total_volume,
    sum(r.total_fees)                                        AS total_fees,
    sum(r.realized_pnl)                                      AS realized_pnl,
    min(r.first_trade)                                       AS first_trade,
    max(r.last_trade)                                        AS last_trade,
    CAST(
        (
            m.question_id,
            nullIf(coalesce(q.name, ''), ''),
            q.fallback_outcome_id
        )
        AS Tuple(
            question_id Nullable(UInt64),
            name Nullable(String),
            fallback_outcome_id Nullable(UInt64)
        )
    )                                                        AS question
FROM rows AS r
LEFT JOIN (
    SELECT outcome_id, name, status, side_specs, question_id
    FROM {db_hypercore:Identifier}.state_outcome_meta FINAL
) AS m ON m.outcome_id = r.outcome_id
LEFT JOIN (
    SELECT question_id, name, fallback_outcome_id
    FROM {db_hypercore:Identifier}.state_question_meta FINAL
) AS q ON q.question_id = m.question_id
WHERE (empty({outcome_id:Array(String)})  OR r.outcome_id IN (SELECT toUInt64(arrayJoin({outcome_id:Array(String)}))))
  AND (empty({question_id:Array(String)}) OR r.outcome_id IN (SELECT outcome_id FROM question_outcome_ids))
GROUP BY r.user, r.outcome_id, m.name, m.status, m.side_specs, m.question_id, q.name, q.fallback_outcome_id
ORDER BY total_volume DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
