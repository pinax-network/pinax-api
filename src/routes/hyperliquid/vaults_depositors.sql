WITH
    deposits AS (
        SELECT
            vault,
            splitByChar(',', users)[1]    AS user,
            sum(usdc_num)                 AS deposits,
            count()                       AS deposit_count,
            max(timestamp)                AS last_deposit_at
        FROM {db_hypercore:Identifier}.ledger_vault_deposits
        WHERE vault IN {vault:Array(String)}
        GROUP BY vault, user
    ),
    withdrawals AS (
        SELECT
            vault,
            user,
            sum(net_withdrawn_usd_num)    AS withdrawals,
            count()                       AS withdrawal_count,
            max(timestamp)                AS last_withdrawal_at
        FROM {db_hypercore:Identifier}.ledger_vault_withdrawals
        WHERE vault IN {vault:Array(String)}
        GROUP BY vault, user
    ),
    distributions AS (
        SELECT
            vault,
            splitByChar(',', users)[1]    AS user,
            sum(usdc_num)                 AS distributions_received
        FROM {db_hypercore:Identifier}.ledger_vault_distributions
        WHERE vault IN {vault:Array(String)}
        GROUP BY vault, user
    )
SELECT
    deposits.user                                       AS user,
    deposits.vault                                      AS vault,
    deposits.deposits                                   AS deposits,
    deposits.deposit_count                              AS deposit_count,
    coalesce(withdrawals.withdrawals, 0)                AS withdrawals,
    coalesce(withdrawals.withdrawal_count, 0)           AS withdrawal_count,
    coalesce(distributions.distributions_received, 0)   AS distributions_received,
    greatest(deposits.last_deposit_at, withdrawals.last_withdrawal_at) AS last_activity_at
FROM deposits
LEFT JOIN withdrawals    USING (vault, user)
LEFT JOIN distributions  USING (vault, user)
ORDER BY deposits DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
