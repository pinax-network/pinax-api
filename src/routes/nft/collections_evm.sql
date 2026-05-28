WITH
erc721_stats AS (
    SELECT
        contract,
        uniq(token_id) AS total_supply,
        uniq(owner) AS owners
    FROM (
        SELECT
            contract,
            token_id,
            argMax(owner, global_sequence) AS owner
        FROM {db_nft:Identifier}.erc721_owners
        PREWHERE contract = {contract: String}
        GROUP BY contract, token_id
    )
    GROUP BY contract
),
erc721_transfer_stats AS (
    SELECT
        contract,
        count() AS total_transfers
    FROM {db_nft:Identifier}.erc721_transfers
    PREWHERE contract = {contract: String}
    GROUP BY contract
),
erc721_contract_metadata AS (
    SELECT
        contract,
        argMax(name, block_num) AS name,
        argMax(symbol, block_num) AS symbol
    FROM {db_nft:Identifier}.erc721_metadata_by_contract
    PREWHERE contract = {contract: String}
    GROUP BY contract
),
erc721 AS (
    SELECT
        m.contract AS contract,
        'ERC721' AS token_standard,
        m.name,
        m.symbol,
        s.total_supply,
        s.total_supply AS total_unique_supply,
        s.owners,
        t.total_transfers,
        {network:String} AS network
    FROM erc721_contract_metadata AS m
    LEFT JOIN erc721_stats s ON m.contract = s.contract
    LEFT JOIN erc721_transfer_stats t ON m.contract = t.contract
),
erc1155_stats AS (
    SELECT
        contract,
        uniq(token_id) AS total_unique_supply,
        sum(balance) AS total_supply,
        uniq(owner) AS owners
    FROM (
        SELECT contract, token_id, owner, sum(balance) AS balance
        FROM {db_nft:Identifier}.erc1155_balances
        PREWHERE contract = {contract: String}
        GROUP BY contract, token_id, owner
        HAVING balance > 0
    )
    GROUP BY contract
),
erc1155_transfer_stats AS (
    SELECT
        contract,
        count() AS total_transfers
    FROM {db_nft:Identifier}.erc1155_transfers
    PREWHERE contract = {contract: String}
    GROUP BY contract
),
erc1155_contract_metadata AS (
    SELECT
        contract,
        argMax(name, block_num) AS name,
        argMax(symbol, block_num) AS symbol
    FROM {db_nft:Identifier}.erc1155_metadata_by_contract
    PREWHERE contract = {contract: String}
    GROUP BY contract
),
erc1155 AS (
    SELECT
        {contract: String} AS contract,
        'ERC1155' AS token_standard,
        m.name,
        m.symbol,
        s.total_supply,
        s.total_unique_supply,
        s.owners,
        t.total_transfers,
        {network:String} AS network
    FROM erc1155_contract_metadata AS m
    LEFT JOIN erc1155_stats s ON m.contract = s.contract
    LEFT JOIN erc1155_transfer_stats t ON m.contract = t.contract
),
combined AS (
    SELECT * FROM erc721
    UNION ALL
    SELECT * FROM erc1155
),
contract_creation AS (
    SELECT
        address AS contract,
        timestamp,
        `from` AS creator
    FROM {db_contracts:Identifier}.contracts
    PREWHERE address = {contract: String}
)
SELECT
    /* join_use_nulls = 1 (below) promotes these to NULL when the contracts
       table has no row — chains extracted via the firehose RPC poller
       (DETAILLEVEL_BASE) have no Create-call records. */
    timestamp AS contract_creation,
    creator AS contract_creator,
    contract,
    name,
    symbol,
    token_standard,
    owners,
    total_supply,
    total_unique_supply,
    total_transfers,
    network
FROM combined
LEFT JOIN contract_creation USING (contract)
SETTINGS join_use_nulls = 1
