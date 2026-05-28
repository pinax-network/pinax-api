WITH b_raw AS (
    /* Pull the LIMIT'd window from historical_erc20_balances first so the
       metadata lookup is bounded to the contracts in the result. */
    SELECT
        timestamp,
        contract,
        open,
        high,
        low,
        close
    FROM {db_balances:Identifier}.historical_erc20_balances
    WHERE
        /* required */
        interval_min = {interval:UInt32}
        AND address = {address:String}
        /* optional */
        AND (empty({contract:Array(String)}) OR contract IN {contract:Array(String)})
        AND (isNull({start_time:Nullable(UInt64)}) OR timestamp >= {start_time:Nullable(UInt64)})
        AND (isNull({end_time:Nullable(UInt64)})   OR timestamp <= {end_time:Nullable(UInt64)})
    ORDER BY timestamp DESC
    LIMIT  {limit:UInt64}
    OFFSET {offset:UInt64}
),
meta AS (
    /* metadata.metadata is ORDER BY (network, contract); filtering on both lets
       the primary key prune the scan to just the contracts in this window
       rather than scanning the full network prefix that the previous JOIN-only
       condition fell back to. */
    SELECT
        contract,
        argMax(name,     block_num) AS name,
        argMax(symbol,   block_num) AS symbol,
        argMax(decimals, block_num) AS decimals
    FROM metadata.metadata
    WHERE network = {network:String}
      AND contract IN (SELECT contract FROM b_raw)
    GROUP BY contract
)
SELECT
    /* primary */
    b.timestamp as datetime,
    {address:String} AS address,
    b.contract AS contract,

    /* OHLC */
    b.open / pow(10, m.decimals) AS open,
    b.high / pow(10, m.decimals) AS high,
    b.low / pow(10, m.decimals) AS low,
    b.close / pow(10, m.decimals) AS close,

    /* metadata */
    nullIf(m.name, '') AS name,
    nullIf(m.symbol, '') AS symbol,
    m.decimals AS decimals,

    /* network */
    {network:String} AS network
FROM b_raw AS b
JOIN meta AS m ON m.contract = b.contract
ORDER BY b.timestamp DESC
