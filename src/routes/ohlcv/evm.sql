WITH
ohlc_raw AS (
    /* Read the LIMIT'd window of OHLC rows first so the downstream metadata
       lookup is bounded to the tokens that actually appear in the result. */
    SELECT
        p.timestamp        AS datetime,
        p.pool             AS pool,
        p.token0           AS token0,
        p.token1           AS token1,
        p.open0            AS open0,
        p.high_quantile0   AS high_quantile0,
        p.low_quantile0    AS low_quantile0,
        p.close0           AS close0,
        p.gross_volume0    AS gross_volume0,
        p.transactions     AS transactions,
        p.token0 IN {stablecoin_contracts: Array(String)} AS is_stablecoin
    FROM {db_dex:Identifier}.ohlc_prices p
    WHERE
            p.interval_min = {interval: UInt64}
        AND p.pool = {pool: String}
        AND (isNull({start_time:Nullable(UInt64)}) OR p.timestamp >= toDateTime({start_time:Nullable(UInt64)}))
        AND (isNull({end_time:Nullable(UInt64)})   OR p.timestamp <= toDateTime({end_time:Nullable(UInt64)}))
    ORDER BY datetime DESC
    LIMIT   {limit:UInt64}
    OFFSET  {offset:UInt64}
),
meta AS (
    /* metadata.metadata is ORDER BY (network, contract); filtering on both lets
       the primary key prune the scan to ≤2 contracts per query (token0, token1)
       instead of the entire network prefix that the previous JOIN-only condition
       fell back to. */
    SELECT
        contract,
        argMax(symbol,   block_num) AS symbol,
        argMax(decimals, block_num) AS decimals
    FROM metadata.metadata
    WHERE network = {network:String}
      AND contract IN (SELECT arrayJoin([token0, token1]) FROM ohlc_raw)
    GROUP BY contract
),
ohlc AS (
    SELECT
        /* Time */
        r.datetime AS datetime,

        /* DEX identity */
        CONCAT(m0.symbol, m1.symbol) AS ticker,
        r.pool AS pool,

        /* OHLC */
        pow(10, m1.decimals - m0.decimals) AS price_multiplier,
        r.open0 / price_multiplier AS open_raw,
        greatest(
            r.high_quantile0,
            r.open0,
            r.close0
        ) / price_multiplier AS high_raw,
        least(
            r.low_quantile0,
            r.open0,
            r.close0
        ) / price_multiplier AS low_raw,
        r.close0 / price_multiplier AS close_raw,

        /* Volume */
        r.gross_volume0 / pow(10, m0.decimals) AS volume,

        /* Universal */
        r.transactions AS transactions,

        /* extra fields */
        r.is_stablecoin AS is_stablecoin
    FROM ohlc_raw r
    LEFT JOIN meta m0 ON m0.contract = r.token0
    LEFT JOIN meta m1 ON m1.contract = r.token1
)
SELECT
    /* Time */
    datetime,

    /* DEX identity */
    ticker,
    pool,

    /* OHLC */
    if(is_stablecoin, 1/open_raw, open_raw) AS open,
    if(is_stablecoin, 1/low_raw, high_raw) AS high,
    if(is_stablecoin, 1/high_raw, low_raw) AS low,
    if(is_stablecoin, 1/close_raw, close_raw) AS close,
    volume,
    transactions,

    /* Network */
    {network: String} AS network
FROM ohlc
