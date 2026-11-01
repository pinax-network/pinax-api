WITH erc721 AS (
    WITH (
        SELECT count()
        FROM (
            SELECT contract, token_id
            FROM {db_nft:Identifier}.erc721_owners
            WHERE contract = {contract:String}
            GROUP BY contract, token_id
        )
    ) AS total_supply
    SELECT
        {contract:String} AS contract,
        'ERC721' AS token_standard,
        owner AS address,
        count() AS quantity,
        uniq(token_id) AS unique_tokens,
        100 * quantity / total_supply AS percentage,
        {network:String} AS network
    FROM (
        SELECT
            contract,
            token_id,
            argMax(owner, global_sequence) AS owner
        FROM {db_nft:Identifier}.erc721_owners
        WHERE contract = {contract:String}
        GROUP BY contract, token_id
    ) AS o
    GROUP BY owner
),
erc1155 AS (
    WITH (
        SELECT sum(balance) AS supply
        FROM (
            SELECT contract, token_id, owner, sum(balance) AS balance
            FROM {db_nft:Identifier}.erc1155_balances
            WHERE contract = {contract:String}
            GROUP BY contract, token_id, owner
            HAVING balance > 0
        )
    ) AS total_supply
    SELECT
        {contract:String} AS contract,
        'ERC1155' AS token_standard,
        owner,
        sum(balance) AS quantity,
        uniq(token_id) AS unique_tokens,
        100 * quantity / total_supply AS percentage,
        {network:String} AS network
    FROM (
        SELECT contract, token_id, owner, sum(balance) AS balance
        FROM {db_nft:Identifier}.erc1155_balances
        WHERE contract = {contract:String}
        GROUP BY contract, token_id, owner
        HAVING balance > 0
    ) AS b
    GROUP BY owner
),
combined AS (
    SELECT * FROM erc721
    UNION ALL
    SELECT * FROM erc1155
)
SELECT *
FROM combined
/* address breaks ties, so holders with equal shares page deterministically */
ORDER BY percentage DESC, address
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
