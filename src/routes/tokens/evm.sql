WITH transfers AS (
    SELECT
        log_address AS contract,
        count() AS total_transfers
    FROM {db_transfers:Identifier}.transfers
    WHERE log_address IN {contract:Array(String)}
    GROUP BY log_address
),
circulating AS (
    /* erc20_balances is a ReplicatedReplacingMergeTree keyed by (contract, address)
       with block_num as the version column. FINAL collapses to the latest balance
       per (contract, address) in a single merge pass — replaces the previous
       (SELECT … argMax(balance, block_num) GROUP BY contract, address HAVING balance>0)
       + outer GROUP BY contract two-stage aggregation. */
    SELECT
        contract,
        countIf(balance > 0)        AS holders,
        sumIf(balance, balance > 0) AS circulating_supply,
        max(block_num)              AS block_num,
        max(timestamp)              AS timestamp
    FROM {db_balances:Identifier}.erc20_balances FINAL
    WHERE contract IN {contract:Array(String)}
    GROUP BY contract
),
meta AS (
    /* metadata.metadata is ORDER BY (network, contract); pushing contract IN (...)
       here engages the full primary key instead of letting the JOIN scan all
       contracts for the network. */
    SELECT
        contract,
        argMax(name,     block_num) AS name,
        argMax(symbol,   block_num) AS symbol,
        argMax(decimals, block_num) AS decimals
    FROM metadata.metadata
    WHERE network = {network:String}
      AND contract IN {contract:Array(String)}
    GROUP BY contract
)
SELECT
    /* timestamps */
    c.timestamp AS last_update,
    c.block_num AS last_update_block_num,
    toUnixTimestamp(c.timestamp) AS last_update_timestamp,

    /* identifiers */
    c.contract AS contract,

    /* amounts */
    c.circulating_supply / pow(10, m.decimals) AS circulating_supply,
    c.holders AS holders,
    t.total_transfers AS total_transfers,

    /* token metadata */
    m.name     AS name,
    m.symbol   AS symbol,
    m.decimals AS decimals,

    /* network */
    {network:String} AS network
FROM circulating AS c
JOIN transfers AS t ON t.contract = c.contract
JOIN meta      AS m ON m.contract = c.contract
ORDER BY t.total_transfers DESC
