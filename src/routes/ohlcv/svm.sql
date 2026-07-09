WITH
/* Find the timestamp cutoff of the most-recent (limit+offset) candles FIRST.
   This only reads/aggregates the cheap `timestamp` column to enumerate distinct
   buckets, so it can use the primary key and stop early — unlike the main query
   below, whose argMin/quantile/uniq state-merges are expensive to read.
   Without this bound the main GROUP BY has to merge the pool's ENTIRE history
   before ORDER BY ... LIMIT can discard it, which is what makes high-activity
   pools take >10s and time out (500). The cutoff preserves exact semantics:
   `timestamp >= min_bucket` selects precisely the most-recent buckets, including
   for sparse pools whose candles span a much wider wall-clock range than
   interval*limit. */
window_bound AS
(
    SELECT min(bucket) AS min_ts
    FROM
    (
        SELECT toStartOfInterval(timestamp, INTERVAL {interval:UInt64} MINUTE) AS bucket
        FROM {db_dex:Identifier}.state_ohlc_prices
        WHERE interval_min = {interval: UInt64}
        AND amm_pool = {amm_pool: String}
        AND (isNull({start_time:Nullable(UInt64)}) OR timestamp >= toDateTime({start_time:Nullable(UInt64)}))
        AND (isNull({end_time:Nullable(UInt64)}) OR timestamp <= toDateTime({end_time:Nullable(UInt64)}))
        GROUP BY bucket
        ORDER BY bucket DESC
        LIMIT {limit: UInt64}
        OFFSET {offset: UInt64}
    )
),
ohlc AS
(
    SELECT
        if(
            toTime(toStartOfInterval(o.timestamp, INTERVAL {interval:UInt64} MINUTE)) = toDateTime('1970-01-02 00:00:00'),
            toDate(toStartOfInterval(o.timestamp, INTERVAL {interval:UInt64} MINUTE)),
            toStartOfInterval(o.timestamp, INTERVAL {interval:UInt64} MINUTE)
        ) AS datetime,
        toString(o.amm) AS amm,
        toString(o.amm_pool) AS amm_pool,
        toString(o.mint0) AS token0,
        toString(o.mint1) AS token1,
        argMinMerge(open0) AS open_raw,
        quantileDeterministicMerge(0.95)(quantile0) AS high_raw,
        quantileDeterministicMerge(0.05)(quantile0) AS low_raw,
        argMaxMerge(close0) AS close_raw,
        sum(gross_volume1) AS volume,
        uniqMerge(uniq_user) AS uaw,
        sum(transactions) AS transactions,
        token0 IN {stablecoin_contracts:Array(String)} AS is_stablecoin
    FROM {db_dex:Identifier}.state_ohlc_prices AS o
    WHERE interval_min = {interval: UInt64}
    AND amm_pool = {amm_pool: String}
    AND (isNull({start_time:Nullable(UInt64)}) OR timestamp >= toDateTime({start_time:Nullable(UInt64)}))
    AND (isNull({end_time:Nullable(UInt64)}) OR timestamp <= toDateTime({end_time:Nullable(UInt64)}))
    /* Restrict the heavy state-merge to the most-recent buckets found above. */
    AND o.timestamp >= (SELECT min_ts FROM window_bound)
    GROUP BY token0, token1, amm, amm_pool, datetime
    ORDER BY datetime DESC
    LIMIT {limit: UInt64}
    OFFSET {offset: UInt64}
),
decs AS
(
    SELECT mint, any(decimals) AS dec_value
    FROM {db_accounts:Identifier}.decimals_state
    WHERE mint IN (SELECT token0 FROM ohlc UNION ALL SELECT token1 FROM ohlc)
      AND decimals != 0
    GROUP BY mint
)
SELECT
    o.datetime AS datetime,
    o.amm AS amm,
    o.amm_pool AS amm_pool,
    o.token0 AS token0,
    coalesce(d0.dec_value, 9) AS token0_decimals,
    o.token1 AS token1,
    coalesce(d1.dec_value, 9) AS token1_decimals,
    pow(10, -(token1_decimals - token0_decimals)) * if(is_stablecoin, 1/open_raw, open_raw) AS open,
    pow(10, -(token1_decimals - token0_decimals)) * if(is_stablecoin, 1/low_raw, high_raw) AS high,
    pow(10, -(token1_decimals - token0_decimals)) * if(is_stablecoin, 1/high_raw, low_raw) AS low,
    pow(10, -(token1_decimals - token0_decimals)) * if(is_stablecoin, 1/close_raw, close_raw) AS close,
    pow(10, -(token1_decimals)) * toFloat64(volume) * if(is_stablecoin, close, 1) AS volume,
    uaw,
    transactions
FROM ohlc AS o
LEFT JOIN decs AS d0 ON d0.mint = o.token0
LEFT JOIN decs AS d1 ON d1.mint = o.token1
ORDER BY datetime DESC;
