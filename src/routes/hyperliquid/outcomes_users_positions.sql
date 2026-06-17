WITH
    question_outcome_ids AS (
        SELECT arrayJoin(arrayConcat(named_outcome_ids, settled_outcome_ids, [fallback_outcome_id])) AS outcome_id
        FROM {db_hypercore:Identifier}.state_question_meta FINAL
        WHERE question_id IN (SELECT toUInt64(arrayJoin({question_id:Array(String)})))
    ),
    rows AS (
        SELECT
            user,
            coin,
            outcome_id,
            side_index,
            share_balance,
            last_fill_time,
            last_block_num
        FROM {db_hypercore:Identifier}.state_user_outcome_position FINAL
        WHERE share_balance > 0
          AND (empty({user:Array(String)})        OR user       IN {user:Array(String)})
          AND (empty({outcome_id:Array(String)})  OR outcome_id IN (SELECT toUInt64(arrayJoin({outcome_id:Array(String)}))))
          AND (empty({question_id:Array(String)}) OR outcome_id IN (SELECT outcome_id FROM question_outcome_ids))
    ),
    meta AS (
        SELECT outcome_id, name AS outcome_name, side_specs, status, question_id, settle_fraction
        FROM {db_hypercore:Identifier}.state_outcome_meta FINAL
        WHERE outcome_id IN (SELECT outcome_id FROM rows)
    )
SELECT
    r.user                                                       AS user,
    r.share_balance                                              AS share_balance,
    r.last_fill_time                                             AS last_fill_time,
    r.last_block_num                                             AS last_block_num,
    CAST(
        (
            r.outcome_id,
            coalesce(m.outcome_name, ''),
            m.question_id,
            nullIf(coalesce(q.name, ''), ''),
            coalesce(m.status, ''),
            m.settle_fraction,
            r.coin,
            r.side_index,
            coalesce(m.side_specs[r.side_index + 1], '')
        )
        AS Tuple(
            outcome_id UInt64,
            outcome_name String,
            question_id Nullable(UInt64),
            question_name Nullable(String),
            status String,
            settle_fraction Nullable(Float64),
            coin String,
            side_index UInt8,
            side_label String
        )
    )                                                            AS outcome
FROM rows AS r
LEFT JOIN meta AS m ON m.outcome_id = r.outcome_id
LEFT JOIN (
    SELECT question_id, name
    FROM {db_hypercore:Identifier}.state_question_meta FINAL
    WHERE question_id IN (SELECT question_id FROM meta WHERE question_id IS NOT NULL)
) AS q ON q.question_id = m.question_id
ORDER BY r.share_balance DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
