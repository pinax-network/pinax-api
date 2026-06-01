# Proposal: fast + correct ERC-20 `/holders` via a `(contract, balance)` projection

**Status:** draft / for discussion
**Author:** perf audit (June 2026), follow-up to PR #558
**Scope:** DB-side schema change on `<network>:evm-balances@*.erc20_balances` + a query rewrite in `src/routes/holders/evm.sql`. No handler changes.

---

## 1. Problem

`GET /v1/evm/holders` returns the top-N holders of an ERC-20 contract ranked by **current** balance. The query is:

```sql
SELECT … FROM erc20_balances FINAL
WHERE contract = {contract} AND balance > 0
ORDER BY balance DESC, address
LIMIT {limit} OFFSET {offset}
```

`erc20_balances` is:

```
ENGINE = ReplicatedReplacingMergeTree(block_num)
ORDER BY (contract, address)
-- skip index: minmax idx_balance (GRANULARITY 1)
-- projections: prj_address_contract (ORDER BY address, contract), prj_contract_count
```

Nothing is ordered by `balance`, so a top-N-by-balance read must scan **every holder of the contract** and sort. Measured on polygon:

| Token | holder rows | time | rows read |
| --- | --- | --- | --- |
| USDT `0xc213…` | 60M | ~1.6s warm / 3.6s cold | 64M / 8.1GB |
| Worst `0x2ab0…` | 225M | ~4.9s | ~225M |

`idx_balance` (minmax) prunes nothing because `balance` is scattered across address-ordered granules. Only ~184 polygon contracts have >1M holder rows, but those are exactly the popular tokens (USDT, USDC, …) people query and paginate.

This query is **correct** today — it's just slow.

## 2. Why there is no query-only fix

PR #558 attempted a two-pass rewrite (skip-index top-k candidates → `argMax` dedup) and **had to be reverted** because it returned wrong results. Summary of everything tried (all validated against a `FINAL`/`argMax` ground truth, which agree 100/100):

| Approach | Fast? | Correct? | Note |
| --- | --- | --- | --- |
| `FINAL … ORDER BY balance DESC LIMIT N` (current) | ❌ ~1.6s/3.6s | ✅ exact | full-contract scan |
| skip-index top-k on **raw rows** | ✅ ~0.6s | ❌ **wrong** | USDT page 2 = 65/100; limit=1000 = 334/1000 |
| `LIMIT 1 BY address` (distinct candidates) | ❌ ~1.45s | ✅ exact | dedup defeats the skip-index prune |
| distinct `GROUP BY address` | ❌ ~1.55s | ✅ exact | reads all contract rows |

Root cause of the wrong-but-fast case: candidates were ranked by **raw rows** from a `ReplacingMergeTree`. The top holders are exchanges with many *unmerged* balance-change rows (~6 each, up to 14), so their duplicate rows consume the candidate window and crowd real holders out — only 185 of the true top 210 even reached the pool. Copilot's review on PR #558 independently flagged this.

There is no way to be both fast and correct at the query layer, because the data is not ordered by the column we rank on. (The native `/holders/native` endpoint gets away with a distinct-candidate `GROUP BY` only because its per-network cutoff shrinks the set first via `idx_balance`; ERC-20 has no equivalent — its only filter is `contract=X`, which still spans every holder, and a per-*token* cutoff is infeasible.)

## 3. Proposed fix: a `(contract, balance)` projection

Add a balance-ordered projection so the candidate read becomes a range read instead of a full-contract scan:

```sql
ALTER TABLE `<network>:evm-balances@vX`.erc20_balances
  ON CLUSTER `tokenapis-c`
  ADD PROJECTION prj_contract_balance (SELECT * ORDER BY contract, balance);

ALTER TABLE `<network>:evm-balances@vX`.erc20_balances
  ON CLUSTER `tokenapis-c`
  MATERIALIZE PROJECTION prj_contract_balance;   -- heavy background mutation
```

With `(contract, balance)` ordering, `WHERE contract=X ORDER BY balance DESC LIMIT K` is a primary-key range read on the projection (~ms). The table already sets `deduplicate_merge_projection_mode = 'rebuild'`, so the projection stays consistent with the `ReplacingMergeTree` dedup on merge — same mechanism as the existing `prj_address_contract`.

### Query rewrite

`FINAL` **bypasses projections** (verified via `EXPLAIN`), so keep a two-pass shape: pass-1 reads distinct candidates from the projection (no `FINAL`); pass-2 resolves exact current balances over the small candidate set with `argMax`.

```sql
WITH candidates AS (              -- served by prj_contract_balance: range read, no full scan
    SELECT address
    FROM {db_balances:Identifier}.erc20_balances
    WHERE contract = {contract:String} AND balance > 0
    ORDER BY balance DESC, address              -- address tie-breaker → deterministic paging
    LIMIT 1 BY address                          -- distinct per address (peak-balance row)
    LIMIT {limit:UInt64} + {offset:UInt64} * 2 + 1000
)
SELECT
    address,
    argMax(balance, block_num)   AS amount,     -- exact current balance (== FINAL semantics)
    argMax(timestamp, block_num) AS ts,
    max(block_num)               AS bn
FROM {db_balances:Identifier}.erc20_balances
WHERE contract = {contract:String} AND address IN (SELECT address FROM candidates)
GROUP BY address
HAVING amount > 0
ORDER BY amount DESC, address
LIMIT {limit:UInt64} OFFSET {offset:UInt64}
-- (downstream is_contract lookup + metadata join unchanged)
```

Notes:
- `LIMIT 1 BY address` makes candidates **distinct** (addresses Copilot's point), so the candidate window holds K real addresses, not K raw rows.
- The `offset*2 + 1000` buffer covers addresses whose *peak* balance outranks their *current* balance (faded whales); it scales headroom with depth so deep pages stay exact. This is the same buffer the shipped native endpoint uses (exact through offset 3000+ on the worst-dup chain tested).
- Expected: correct at all depths **and** sub-second. The shipped native endpoint already proves the distinct-candidate + `argMax` shape is correct; the projection is what supplies the missing *fast* candidate read for ERC-20.

## 4. Cost / tradeoffs

- **Storage** (the main reason this wasn't done in PR #558): one extra full copy of `erc20_balances` per network. The table is large, and it already carries `prj_address_contract` + `prj_contract_count`.
- **Rollout:** `ADD` + `MATERIALIZE PROJECTION` per network — a heavy background mutation (comparable to the recent `erc1155_balances` `idx_owner` materialization). Must also be added to the substreams sink schema so it survives re-syncs.
- **Buffer assumption:** `offset*2 + 1000` distinct candidates must exceed the count of faded-whale addresses ranked above the page. Safe across all chains tested; revisit only if a chain shows a wrong rank at deep pagination.
- **Access:** the `token_api` query user is read-only and cannot run the `ALTER` — needs a privileged user.

## 5. Recommendation

1. Land PR #558 (native only) now — it's correct and 1.3–1.9× faster.
2. Treat ERC-20 as a separate change gated on the storage/rollout decision. Once `prj_contract_balance` exists on one network, the query above can be validated against the `FINAL` ground truth before rolling out further.

Until the projection exists, **keep the original `FINAL` query** — it is correct, just slow.
