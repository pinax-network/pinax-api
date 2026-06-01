WITH
/* Rank pools by total transactions, choosing the source table by whether a mint
   filter is present. Exactly one of the two arrays below is populated; the other
   scans nothing, and arrayConcat picks the live one. Both are bound as cached
   scalars (`WITH (subquery) AS alias`) so each runs at most once instead of being
   re-evaluated by the three downstream references (final SELECT, pools_with_tokens,
   decimals). */

/* Mint filter present: rank straight from state_pools_aggregating_by_mint, whose
   first primary-key column is `mint` — so WHERE mint IN (...) is a tight, complete,
   deterministic scan over only that mint's pools. This replaces the previous
   `SELECT DISTINCT amm_pool ... LIMIT 100000` (no ORDER BY), which ranked an
   arbitrary subset of pools for any mint appearing in >100k pools (wSOL/USDC/USDT)
   and returned non-deterministic results. Scans nothing when {mint} is empty
   (mint IN [] is an empty set).

   Aggregation is max(sum-per-mint), not a plain sum: state_pools_aggregating_by_mint
   holds one (mint, pool, …) row per swap-side, and every requested mint that occurs in a
   pool repeats that pool's transaction count. The inner GROUP BY collapses the (unmerged
   AggregatingMergeTree) parts per mint; the outer max() then takes a single mint's value
   instead of adding them, so a pool containing >1 requested mint (e.g. a USDC/wSOL pool
   queried with mint IN (USDC, wSOL)) is not double-counted. For a single requested mint
   this is identical to summing, and matches the per-(pool,protocol,program_id,amm) total
   in state_pools_aggregating_by_pool used by the unfiltered path. */
(
    SELECT groupArray((amm_pool, protocol, program_id, amm, transactions)) FROM (
        SELECT
            amm_pool,
            protocol,
            program_id,
            amm,
            max(mint_transactions) AS transactions
        FROM (
            SELECT
                amm_pool,
                protocol,
                program_id,
                amm,
                mint,
                sum(transactions) AS mint_transactions
            FROM {db_dex:Identifier}.state_pools_aggregating_by_mint
            WHERE mint IN {mint:Array(String)}
              AND amm_pool != ''
              AND (empty({amm_pool:Array(String)}) OR amm_pool IN {amm_pool:Array(String)})
              AND (empty({amm:Array(String)}) OR amm IN {amm:Array(String)})
              AND (isNull({protocol:Nullable(String)}) OR protocol = {protocol:Nullable(String)})
            GROUP BY amm_pool, protocol, program_id, amm, mint
        )
        GROUP BY amm_pool, protocol, program_id, amm
        ORDER BY transactions DESC, amm_pool ASC, protocol ASC, program_id ASC, amm ASC
        LIMIT  {limit:UInt64}
        OFFSET {offset:UInt64}
    )
) AS ranked_by_mint,
/* No mint filter: rank across all pools from state_pools_aggregating_by_pool. Gated
   on empty({mint}) so this full-table aggregation is skipped entirely (constant-false
   WHERE → no scan) whenever the mint path above is in use. */
(
    SELECT groupArray((amm_pool, protocol, program_id, amm, transactions)) FROM (
        SELECT
            amm_pool,
            protocol,
            program_id,
            amm,
            sum(transactions) AS transactions
        FROM {db_dex:Identifier}.state_pools_aggregating_by_pool
        WHERE empty({mint:Array(String)})
          AND amm_pool != ''
          AND (empty({amm_pool:Array(String)}) OR amm_pool IN {amm_pool:Array(String)})
          AND (empty({amm:Array(String)}) OR amm IN {amm:Array(String)})
          AND (isNull({protocol:Nullable(String)}) OR protocol = {protocol:Nullable(String)})
        GROUP BY amm_pool, protocol, program_id, amm
        ORDER BY transactions DESC, amm_pool ASC, protocol ASC, program_id ASC, amm ASC
        LIMIT  {limit:UInt64}
        OFFSET {offset:UInt64}
    )
) AS ranked_by_pool,
pools AS (
    SELECT
        r.1 AS amm_pool,
        r.2 AS protocol,
        r.3 AS program_id,
        r.4 AS amm,
        r.5 AS transactions
    FROM (SELECT arrayJoin(arrayConcat(ranked_by_mint, ranked_by_pool)) AS r)
),
pools_with_tokens AS (
    SELECT
        amm_pool,
        amm,
        protocol,
        program_id,
        arraySort(groupArrayDistinct(mint)) as tokens,
        arrayElement(tokens, 1) AS token0,
        arrayElement(tokens, 2) AS token1

    FROM {db_dex:Identifier}.state_pools_aggregating_by_mint AS pt
    WHERE amm_pool IN (SELECT amm_pool FROM pools)
    GROUP BY protocol, program_id, amm, amm_pool
),
decimals AS (
    SELECT mint, decimals AS dec_value
    FROM {db_accounts:Identifier}.decimals_state
    WHERE mint IN (
        SELECT arrayJoin([token0, token1]) AS mint FROM pools_with_tokens
    )
    LIMIT 1 BY mint
)
SELECT
    /* DEX */
    p.program_id AS program_id,
    program_names(p.program_id) AS program_name,
    p.protocol AS protocol,
    p.amm AS amm,
    program_names(p.amm) AS amm_name,
    p.amm_pool AS amm_pool,
    pt.token0 AS input_mint,
    if(d0.mint != '', d0.dec_value, NULL) AS input_decimals,
    pt.token1 AS output_mint,
    if(d1.mint != '', d1.dec_value, NULL) AS output_decimals,
    p.transactions AS transactions,

    /* Network */
    {network: String} AS network
FROM pools AS p
JOIN pools_with_tokens AS pt
  ON  p.amm_pool   = pt.amm_pool
  AND p.protocol   = pt.protocol
  AND p.program_id = pt.program_id
  AND p.amm        = pt.amm
LEFT JOIN decimals AS d0 ON d0.mint = pt.token0
LEFT JOIN decimals AS d1 ON d1.mint = pt.token1
ORDER BY p.transactions DESC, p.amm_pool ASC, p.protocol ASC, p.program_id ASC, p.amm ASC
