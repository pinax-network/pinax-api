WITH
    deposits AS (
        SELECT
            vault,
            sum(usdc_num)                                     AS lifetime_deposits,
            count()                                           AS deposit_count,
            uniqExact(splitByChar(',', users)[1])             AS depositor_count,
            max(timestamp)                                    AS last_deposit_at
        FROM {db_hypercore:Identifier}.ledger_vault_deposits
        WHERE (isNull({vault:Nullable(String)}) OR vault = {vault:Nullable(String)})
        GROUP BY vault
    ),
    withdrawals AS (
        SELECT
            vault,
            sum(net_withdrawn_usd_num)                        AS lifetime_withdrawals,
            sum(commission_num)                               AS lifetime_leader_commissions,
            count()                                           AS withdrawal_count,
            max(timestamp)                                    AS last_withdrawal_at
        FROM {db_hypercore:Identifier}.ledger_vault_withdrawals
        WHERE (isNull({vault:Nullable(String)}) OR vault = {vault:Nullable(String)})
        GROUP BY vault
    ),
    distributions AS (
        SELECT
            vault,
            sum(usdc_num)                                     AS lifetime_distributions
        FROM {db_hypercore:Identifier}.ledger_vault_distributions
        WHERE (isNull({vault:Nullable(String)}) OR vault = {vault:Nullable(String)})
        GROUP BY vault
    ),
    creates AS (
        SELECT
            vault,
            argMin(splitByChar(',', users)[1], timestamp)     AS leader,
            min(timestamp)                                    AS created_at,
            argMin(usdc_num, timestamp)                       AS initial_deposit,
            argMin(fee_num, timestamp)                        AS create_fee
        FROM {db_hypercore:Identifier}.ledger_vault_creates
        WHERE (isNull({vault:Nullable(String)}) OR vault = {vault:Nullable(String)})
        GROUP BY vault
    )
SELECT
    deposits.vault                                              AS vault,
    nullIf(creates.leader, '')                                  AS leader,
    nullIf(creates.created_at, toDateTime('1970-01-01 00:00:00', 'UTC')) AS created_at,
    coalesce(creates.initial_deposit, 0)                        AS initial_deposit,
    coalesce(creates.create_fee, 0)                             AS create_fee,
    coalesce(deposits.lifetime_deposits, 0)                     AS lifetime_deposits,
    coalesce(withdrawals.lifetime_withdrawals, 0)               AS lifetime_withdrawals,
    coalesce(distributions.lifetime_distributions, 0)           AS lifetime_distributions,
    coalesce(withdrawals.lifetime_leader_commissions, 0)        AS lifetime_leader_commissions,
    deposits.depositor_count                                    AS depositor_count,
    deposits.deposit_count                                      AS deposit_count,
    coalesce(withdrawals.withdrawal_count, 0)                   AS withdrawal_count,
    greatest(deposits.last_deposit_at, withdrawals.last_withdrawal_at) AS last_activity_at
FROM deposits
LEFT JOIN withdrawals    USING (vault)
LEFT JOIN distributions  USING (vault)
LEFT JOIN creates        USING (vault)
ORDER BY lifetime_deposits DESC
LIMIT {limit:UInt64}
OFFSET {offset:UInt64}
