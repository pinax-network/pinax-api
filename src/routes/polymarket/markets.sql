WITH token_condition_ids AS (
    SELECT DISTINCT condition_id
    FROM {db_scraper:Identifier}.polymarket_markets_by_asset_id
    WHERE notEmpty({token_id:Array(String)})
      AND asset_id IN (SELECT toUInt256(arrayJoin({token_id:Array(String)})))
)
SELECT
    m.condition_id,
    m.market_slug,
    e.slug AS event_slug,
    e.title AS event_title,
    m.question,
    m.description,
    CAST(arrayMap((o, t) -> (o, t), m.outcomes, m.clob_token_ids)
        AS Array(Tuple(label String, token_id String))) AS outcomes,
    m.closed,
    m.neg_risk,
    m.accepting_orders,
    m.fees_enabled,
    m.volume_num AS volume,
    m.start_date,
    m.end_date
FROM {db_scraper:Identifier}.polymarket_markets m FINAL
LEFT JOIN {db_scraper:Identifier}.polymarket_events e FINAL
    ON e.condition_id = m.condition_id
WHERE (empty({condition_id:Array(String)}) OR m.condition_id IN {condition_id:Array(String)})
  AND (empty({market_slug:Array(String)})  OR m.market_slug  IN {market_slug:Array(String)})
  AND (empty({token_id:Array(String)})     OR m.condition_id IN (SELECT condition_id FROM token_condition_ids))
  AND (empty({event_slug:Array(String)})   OR e.slug         IN {event_slug:Array(String)})
  AND (isNull({closed:Nullable(UInt8)})    OR m.closed = {closed:Nullable(UInt8)})
ORDER BY m.volume_num DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
