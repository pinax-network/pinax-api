WITH ohlc AS (
    SELECT
        /* Time */
        p.timestamp AS datetime,

        /* DEX identity */
        CONCAT(m0.symbol, m1.symbol) AS ticker,
        pool,

        /* OHLC */
        pow(10, m1.decimals - m0.decimals) AS price_multiplier,
        open0 / price_multiplier AS open_raw,
        greatest(
            high_quantile0,
            open0,
            close0
        ) / price_multiplier AS high_raw,
        least(
            low_quantile0,
            open0,
            close0
        ) / price_multiplier AS low_raw,
        close0 / price_multiplier AS close_raw,

        /* Volume */
        gross_volume0 / pow(10, m0.decimals) AS volume,

        /* Universal */
        transactions,

        /* extra fields */
        p.token0 IN {stablecoin_contracts: Array(String)} AS is_stablecoin
    FROM {db_dex:Identifier}.ohlc_prices p
    LEFT JOIN metadata.metadata AS m0 FINAL ON {network: String} = m0.network AND p.token0 = m0.contract
    LEFT JOIN metadata.metadata AS m1 FINAL ON {network: String} = m1.network AND p.token1 = m1.contract
    WHERE
            p.interval_min = {interval: UInt64}
        AND p.pool = {pool: String}
        AND (isNull({start_time:Nullable(UInt64)}) OR p.timestamp >= toDateTime({start_time:Nullable(UInt64)}))
        AND (isNull({end_time:Nullable(UInt64)}) OR p.timestamp <= toDateTime({end_time:Nullable(UInt64)}))
    ORDER BY datetime DESC
    LIMIT   {limit:UInt64}
    OFFSET  {offset:UInt64}
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
