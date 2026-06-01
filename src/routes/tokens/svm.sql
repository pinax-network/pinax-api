WITH circulating AS (
    SELECT
        block_num,
        timestamp,
        program_id,
        mint,
        holders,
        circulating_supply
    FROM {db_balances:Identifier}.balances_metadata AS b
    WHERE mint IN {mint:Array(String)}
),
metadata AS
(
    SELECT mint, name, symbol, uri
    FROM {db_metadata:Identifier}.metadata
    WHERE mint IN {mint:Array(String)}
    ORDER BY timestamp DESC
    LIMIT 1 BY mint
),
decimals AS
(
    SELECT mint, decimals
    FROM {db_accounts:Identifier}.decimals_state
    WHERE mint IN {mint:Array(String)}
    LIMIT 1 BY mint
)
SELECT
    /* timestamps */
    c.timestamp AS last_update,
    c.block_num AS last_update_block_num,
    toUnixTimestamp(c.timestamp) AS last_update_timestamp,

    /* identifiers */
    toString(c.program_id) AS program_id,
    toString(c.mint) AS mint,

    /* amounts */
    c.circulating_supply / pow(10, d.decimals) AS circulating_supply,
    c.holders AS holders,

    /* metadata */
    d.decimals AS decimals,
    m.name AS name,
    m.symbol AS symbol,
    m.uri AS uri,

    {network:String} AS network
FROM circulating AS c
LEFT JOIN metadata AS m USING mint
LEFT JOIN decimals AS d USING mint