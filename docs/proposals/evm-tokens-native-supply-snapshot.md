# Proposal: precompute native supply/holders for `/v1/evm/tokens/native`

**Status:** draft / for discussion
**Author:** perf audit (June 2026)
**Scope:** DB-side change on `<network>:evm-balances@*.native_balances` (refreshable MV or projection) + a query rewrite in `src/routes/tokens/evm_native.ts` / `evm_native.sql`. No response-shape change.

---

## 1. Problem

`GET /v1/evm/tokens/native?network=base` **times out**.

The query (`src/routes/tokens/evm_native.sql`) computes chain-wide native-token stats with a full-table dedup-aggregate:

```sql
SELECT count() AS holders, sum(balance) AS circulating_supply,
       max(block_num) AS block_num, max(timestamp) AS timestamp
FROM {db_balances}.native_balances FINAL
WHERE balance > 0
```

`native_balances` is `ReplicatedReplacingMergeTree(block_num) ORDER BY address`. To return **current** balances it must dedup every address (`FINAL`), then aggregate.

Measured on base:

| metric | value |
| --- | --- |
| raw rows | 742.8M |
| distinct holder addresses (`uniq`) | ~703M (table is ~95% merged) |
| exact aggregate (`FINAL`) | **~28s** (read 50.7% of rows in 14s, extrapolated) |
| raw aggregate (no dedup, wrong) | 1.3s |

The endpoint sets `max_execution_time=60`, so ClickHouse *would* finish — but ~28s exceeds the gateway/client timeout in front of the API (and is far too slow for a live endpoint anyway). mainnet (451M rows) is smaller and currently squeaks under the limit; base is the first to break, others will follow as they grow.

The cost is **producing ~703M groups**, not removing duplicates (the table is already ~95% merged). The existing `prj_count` projection can't help — it has `count()` and `min/max(...)` but **no `sum(balance)` and no `balance>0`/dedup awareness**.

## 2. Why there is no query-only fix

| approach | time | correct? |
| --- | --- | --- |
| `FINAL ... WHERE balance>0` (current) | ~28s | ✅ exact |
| `GROUP BY address argMax(...)` (no FINAL) | ~28s | ✅ exact (same group cost) |
| raw `count()/sum() WHERE balance>0` (no dedup) | 1.3s | ❌ overcounts holders by the unmerged-row fraction; `sum` includes **stale balances** (a whale that moved funds still contributes its old balance) → unsafe for circulating supply |

Exact current-balance aggregation over 703M addresses is inherently multi-second; there is no skip-index or projection that turns "dedup 703M addresses" into a cheap read. But the result is a **single row per chain that changes slowly** — ideal to precompute.

## 3. Proposed fix

### Option A — refreshable materialized view (recommended: exact + fast)

ClickHouse 26.4 supports `REFRESH EVERY`. Run the heavy aggregate in the background and store one row; the endpoint reads it instantly.

```sql
CREATE MATERIALIZED VIEW `<network>:evm-balances@vX`.native_supply_snapshot
  ON CLUSTER `tokenapis-c`
  REFRESH EVERY 15 MINUTE
  ENGINE = ReplicatedReplacingMergeTree ORDER BY tuple()
  AS
SELECT
    count()          AS holders,
    sum(balance)     AS circulating_supply,
    max(block_num)   AS block_num,
    max(timestamp)   AS timestamp
FROM native_balances FINAL
WHERE balance > 0;
```

Endpoint query becomes (reads 1 row, joins metadata):

```sql
SELECT
    s.timestamp AS last_update,
    s.block_num AS last_update_block_num,
    toUnixTimestamp(s.timestamp) AS last_update_timestamp,
    s.circulating_supply / pow(10, m.decimals) AS circulating_supply,
    s.holders AS holders,
    m.name, m.symbol, m.decimals,
    {network:String} AS network
FROM {db_balances:Identifier}.native_supply_snapshot AS s
JOIN metadata.metadata AS m FINAL
  ON {network:String} = m.network
 AND '0x0000000000000000000000000000000000000000' = m.contract;
```

- **Accuracy:** exact as of the last refresh (≤15 min stale — fine for chain-wide supply/holders).
- **Cost:** the ~28s aggregate runs every 15 min per network in the background (not on the request path). Reduce frequency for the largest chains if load is a concern.

### Option B — projection with `sumIf`/`countIf` (no periodic query, ~5% approximate)

```sql
ALTER TABLE native_balances ON CLUSTER `tokenapis-c`
  ADD PROJECTION prj_supply (
    SELECT countIf(balance > 0), sumIf(balance, balance > 0), max(block_num), max(timestamp)
  );
ALTER TABLE native_balances ON CLUSTER `tokenapis-c` MATERIALIZE PROJECTION prj_supply;
```
Query (no `FINAL`, so it can use the projection) reads a single aggregated row → sub-ms. Maintained automatically on merge (`deduplicate_merge_projection_mode='rebuild'` is already set). **Approximate** by the unmerged-part drift (~5% on base today, converging on merge) — acceptable for holders, borderline for circulating supply. One-time `MATERIALIZE` over 742M rows.

## 4. Endpoint code

`evm_native.ts` should read the precomputed source and **fall back to the current live query** for any network that doesn't have the MV/projection yet, so deploy order doesn't matter. Keep `max_execution_time` on the fallback path.

## 5. Cost / tradeoffs / rollout

- Schema change per network (`token_api` API user is read-only — needs a privileged user; same as the recent `erc1155_balances.idx_owner` rollout). Add the MV/projection to the substreams sink schema so it survives re-syncs.
- Option A: exact, isolated, periodic background load. Option B: always-on, cheaper to maintain, slightly approximate.
- Apply to base first (the one timing out); roll out to other networks as they approach the same size.

## 6. Recommendation

Go with **Option A (refreshable MV)** for circulating-supply accuracy. Land the endpoint change with a live-query fallback so it's safe to deploy before the MVs exist, then create the MV per network starting with base.
