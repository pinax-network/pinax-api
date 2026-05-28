WITH circulating AS (
    SELECT
        log_address AS contract,
        count() as total_transfers,
        max(block_num) AS block_num,
        max(timestamp) AS timestamp
    FROM {db_transfers:Identifier}.transfers
    WHERE log_address IN {contract:Array(String)}
    GROUP BY log_address
),
meta AS (
    /* metadata.metadata is ORDER BY (network, contract); push contract IN (...)
       here so the (network, contract) primary key fully engages instead of
       letting the JOIN scan the entire network prefix. */
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
    c.total_transfers AS total_transfers,

    /* token metadata */
    m.name     AS name,
    m.symbol   AS symbol,
    m.decimals AS decimals,

    /* network */
    {network: String} AS network
FROM circulating AS c
JOIN meta AS m ON m.contract = c.contract
ORDER BY c.total_transfers DESC
