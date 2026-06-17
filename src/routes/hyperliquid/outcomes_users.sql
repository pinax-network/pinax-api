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
    sum(r.transactions)                                      AS transactions,
    sum(r.buys)                                              AS buys,
    sum(r.sells)                                             AS sells,
    sum(r.volume_bought)                                     AS volume_bought,
    sum(r.volume_sold)                                       AS volume_sold,
    sum(r.total_volume)                                      AS total_volume,
    sum(r.realized_pnl)                                      AS realized_pnl,
    min(r.first_trade)                                       AS first_trade,
    max(r.last_trade)                                        AS last_trade,
    CAST(
        (
            r.outcome_id,
            coalesce(m.name, ''),
            m.question_id,
            nullIf(coalesce(q.name, ''), ''),
            coalesce(m.status, ''),
            m.settle_fraction
        )
        AS Tuple(
            outcome_id UInt64,
            outcome_name String,
            question_id Nullable(UInt64),
            question_name Nullable(String),
            status String,
            settle_fraction Nullable(Float64)
        )
    )                                                        AS outcome
FROM rows AS r
LEFT JOIN (
    SELECT outcome_id, name, status, question_id, settle_fraction
    FROM {db_hypercore:Identifier}.state_outcome_meta FINAL
) AS m ON m.outcome_id = r.outcome_id
LEFT JOIN (
    SELECT question_id, name
    FROM {db_hypercore:Identifier}.state_question_meta FINAL
) AS q ON q.question_id = m.question_id
WHERE (empty({outcome_id:Array(String)})  OR r.outcome_id IN (SELECT toUInt64(arrayJoin({outcome_id:Array(String)}))))
  AND (empty({question_id:Array(String)}) OR r.outcome_id IN (SELECT outcome_id FROM question_outcome_ids))
GROUP BY r.user, r.outcome_id, m.name, m.status, m.question_id, m.settle_fraction, q.name
ORDER BY total_volume DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
