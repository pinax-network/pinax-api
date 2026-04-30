WITH
    start_ts AS (
        SELECT if(
            isNotNull({start_time:Nullable(UInt64)}),
            toDateTime({start_time:Nullable(UInt64)}),
            now() - INTERVAL 30 DAY
        ) AS t
    ),
    end_ts AS (
        SELECT if(
            isNotNull({end_time:Nullable(UInt64)}),
            toDateTime({end_time:Nullable(UInt64)}),
            now()
        ) AS t
    )
SELECT * FROM (
    SELECT
        timestamp, block_num, event_index, event_hash AS transaction_hash,
        'bridge_deposit' AS event_type, user, '' AS counterparty,
        amount AS amount, 'USDC' AS token, '' AS notes
    FROM {db_hypercore:Identifier}.c_deposits
    WHERE user = {user:String}
      AND timestamp >= (SELECT t FROM start_ts) AND timestamp < (SELECT t FROM end_ts)

    UNION ALL

    SELECT
        timestamp, block_num, event_index, event_hash AS transaction_hash,
        if(is_finalized, 'bridge_withdraw_finalized', 'bridge_withdraw_pending') AS event_type,
        user, '' AS counterparty, -amount AS amount, 'USDC' AS token, '' AS notes
    FROM {db_hypercore:Identifier}.c_withdrawals
    WHERE user = {user:String}
      AND timestamp >= (SELECT t FROM start_ts) AND timestamp < (SELECT t FROM end_ts)

    UNION ALL

    SELECT
        timestamp, block_num, event_index, event_hash AS transaction_hash,
        'deposit' AS event_type, {user:String} AS user, '' AS counterparty,
        usdc_num AS amount, 'USDC' AS token, '' AS notes
    FROM {db_hypercore:Identifier}.ledger_deposits
    WHERE has(splitByChar(',', users), {user:String})
      AND timestamp >= (SELECT t FROM start_ts) AND timestamp < (SELECT t FROM end_ts)

    UNION ALL

    SELECT
        timestamp, block_num, event_index, event_hash AS transaction_hash,
        'withdraw' AS event_type, {user:String} AS user, '' AS counterparty,
        -usdc_num AS amount, 'USDC' AS token, '' AS notes
    FROM {db_hypercore:Identifier}.ledger_withdrawals
    WHERE has(splitByChar(',', users), {user:String})
      AND timestamp >= (SELECT t FROM start_ts) AND timestamp < (SELECT t FROM end_ts)

    UNION ALL

    SELECT
        timestamp, block_num, event_index, event_hash AS transaction_hash,
        'vault_deposit' AS event_type, {user:String} AS user, vault AS counterparty,
        -usdc_num AS amount, 'USDC' AS token, '' AS notes
    FROM {db_hypercore:Identifier}.ledger_vault_deposits
    WHERE has(splitByChar(',', users), {user:String})
      AND timestamp >= (SELECT t FROM start_ts) AND timestamp < (SELECT t FROM end_ts)

    UNION ALL

    SELECT
        timestamp, block_num, event_index, event_hash AS transaction_hash,
        'vault_withdraw' AS event_type, user, vault AS counterparty,
        net_withdrawn_usd_num AS amount, 'USDC' AS token,
        concat('commission=', toString(commission_num), ',basis=', toString(basis_num)) AS notes
    FROM {db_hypercore:Identifier}.ledger_vault_withdrawals
    WHERE user = {user:String}
      AND timestamp >= (SELECT t FROM start_ts) AND timestamp < (SELECT t FROM end_ts)

    UNION ALL

    SELECT
        timestamp, block_num, event_index, event_hash AS transaction_hash,
        'liquidation' AS event_type, {user:String} AS user, '' AS counterparty,
        -liquidated_ntl_pos_num AS amount, 'USDC' AS token,
        concat('leverage=', leverage_type, ',account_value=', toString(account_value_num)) AS notes
    FROM {db_hypercore:Identifier}.ledger_liquidations
    WHERE has(splitByChar(',', users), {user:String})
      AND timestamp >= (SELECT t FROM start_ts) AND timestamp < (SELECT t FROM end_ts)

    UNION ALL

    SELECT
        timestamp, block_num, event_index, event_hash AS transaction_hash,
        'funding' AS event_type, user, coin AS counterparty,
        funding_amount AS amount, 'USDC' AS token,
        concat('position_size=', toString(szi), ',rate=', toString(funding_rate)) AS notes
    FROM {db_hypercore:Identifier}.funding_deltas
    WHERE user = {user:String}
      AND timestamp >= (SELECT t FROM start_ts) AND timestamp < (SELECT t FROM end_ts)
)
WHERE (empty({event_types:Array(String)}) OR has({event_types:Array(String)}, event_type))
ORDER BY timestamp DESC, block_num DESC, event_index DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
