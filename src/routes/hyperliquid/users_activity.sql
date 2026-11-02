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
        block_num, timestamp, event_hash AS transaction_hash, event_index,
        'bridge_deposit' AS event_type, user, '' AS counterparty,
        amount AS amount, 'USDC' AS token, '' AS notes
    FROM {db_hypercore:Identifier}.c_deposits
    WHERE user = {user:String}
      AND timestamp >= (SELECT t FROM start_ts) AND timestamp < (SELECT t FROM end_ts)

    UNION ALL

    SELECT
        block_num, timestamp, event_hash AS transaction_hash, event_index,
        if(is_finalized, 'bridge_withdraw_finalized', 'bridge_withdraw_pending') AS event_type,
        user, '' AS counterparty, -amount AS amount, 'USDC' AS token, '' AS notes
    FROM {db_hypercore:Identifier}.c_withdrawals
    WHERE user = {user:String}
      AND timestamp >= (SELECT t FROM start_ts) AND timestamp < (SELECT t FROM end_ts)

    UNION ALL

    SELECT
        block_num, timestamp, event_hash AS transaction_hash, event_index,
        'deposit' AS event_type, {user:String} AS user, '' AS counterparty,
        usdc_num AS amount, 'USDC' AS token, '' AS notes
    FROM {db_hypercore:Identifier}.ledger_deposits
    WHERE has(splitByChar(',', users), {user:String})
      AND timestamp >= (SELECT t FROM start_ts) AND timestamp < (SELECT t FROM end_ts)

    UNION ALL

    SELECT
        block_num, timestamp, event_hash AS transaction_hash, event_index,
        'withdraw' AS event_type, {user:String} AS user, '' AS counterparty,
        -usdc_num AS amount, 'USDC' AS token, '' AS notes
    FROM {db_hypercore:Identifier}.ledger_withdrawals
    WHERE has(splitByChar(',', users), {user:String})
      AND timestamp >= (SELECT t FROM start_ts) AND timestamp < (SELECT t FROM end_ts)

    UNION ALL

    SELECT
        block_num, timestamp, event_hash AS transaction_hash, event_index,
        'vault_deposit' AS event_type, {user:String} AS user, vault AS counterparty,
        -usdc_num AS amount, 'USDC' AS token, '' AS notes
    FROM {db_hypercore:Identifier}.ledger_vault_deposits
    WHERE has(splitByChar(',', users), {user:String})
      AND timestamp >= (SELECT t FROM start_ts) AND timestamp < (SELECT t FROM end_ts)

    UNION ALL

    SELECT
        block_num, timestamp, event_hash AS transaction_hash, event_index,
        'vault_withdraw' AS event_type, user, vault AS counterparty,
        net_withdrawn_usd_num AS amount, 'USDC' AS token,
        concat('commission=', toString(commission_num), ',basis=', toString(basis_num)) AS notes
    FROM {db_hypercore:Identifier}.ledger_vault_withdrawals
    WHERE user = {user:String}
      AND timestamp >= (SELECT t FROM start_ts) AND timestamp < (SELECT t FROM end_ts)

    UNION ALL

    SELECT
        block_num, timestamp, event_hash AS transaction_hash, event_index,
        'liquidation' AS event_type, {user:String} AS user, '' AS counterparty,
        -liquidated_ntl_pos_num AS amount, 'USDC' AS token,
        concat('leverage=', leverage_type, ',account_value=', toString(account_value_num)) AS notes
    FROM {db_hypercore:Identifier}.ledger_liquidations
    WHERE has(splitByChar(',', users), {user:String})
      AND timestamp >= (SELECT t FROM start_ts) AND timestamp < (SELECT t FROM end_ts)

    UNION ALL

    SELECT
        block_num, timestamp, event_hash AS transaction_hash, event_index,
        'funding' AS event_type, user, coin AS counterparty,
        funding_amount AS amount, 'USDC' AS token,
        concat('position_size=', toString(szi), ',rate=', toString(funding_rate)) AS notes
    FROM {db_hypercore:Identifier}.funding_deltas
    WHERE user = {user:String}
      AND timestamp >= (SELECT t FROM start_ts) AND timestamp < (SELECT t FROM end_ts)
      /* funding_deltas holds a row per user, coin and hour. Its bloom filter on `user` is scanned over
         the whole window, and the user's rows sit in one granule per hour, so a long window reads
         gigabytes for a page of 10. The (dex, user, minute) projection gives the user's newest minutes
         instead. Every minute there holds at least one of the user's rows, and only the window's end
         minute can hold rows that `timestamp < end_ts` excludes, so the newest `limit + offset + 1`
         minutes always hold this branch's share of the page. */
      AND toRelativeMinuteNum(timestamp) IN (
          SELECT minute
          FROM {db_hypercore:Identifier}.funding_deltas
          WHERE user = {user:String}
            AND minute >= toRelativeMinuteNum((SELECT t FROM start_ts))
            AND minute <= toRelativeMinuteNum((SELECT t FROM end_ts))
          GROUP BY minute
          ORDER BY minute DESC
          LIMIT toUInt64({limit:UInt64}) + toUInt64({offset:UInt64}) + 1)
)
WHERE (empty({event_types:Array(String)}) OR has({event_types:Array(String)}, event_type))
/* timestamp first: it leads every table's sorting key, so each branch is read backwards and stops
   at the LIMIT. block_num rises with timestamp, so the order is the same as before. */
ORDER BY timestamp DESC, block_num DESC, event_index DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
/* The page is read backwards along the sorting key and stops at the LIMIT; the read-ahead
   buffering of in-order reads would read far past it. */
SETTINGS read_in_order_use_buffering = 0
