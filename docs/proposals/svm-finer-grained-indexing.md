# Proposal: finer-grained indexing for SVM `swaps` / `transfers` (and large-owner `balances`)

**Status:** draft / for discussion
**Author:** perf audit (May 2026), follow-up to PR #556
**Scope:** DB-side schema changes on `solana:svm-dex@*.swaps`, `solana:svm-transfers@*.transfers`, and (secondary) `solana:svm-balances@*.balances_by_account`. No application changes are required for the index option; the projection/MV options pair with small query rewrites.

---

## 1. Problem

`/v1/svm/swaps` and `/v1/svm/transfers` filter on high-cardinality non-key columns
(`input_mint`, `output_mint`, `user`, `amm_pool`, `fee_payer`, `signer`, … / for transfers
`source`, `destination`, `mint`, `authority`, …) and return the most recent N rows.

Both tables are:

```
ORDER BY (timestamp, block_num, transaction_index, instruction_index)
-- skip indexes: minmax on timestamp/block_num/amount only
-- one PROJECTION prj_<col>_by_minute per filter column: SELECT <col>, minute GROUP BY <col>, minute
```

Because no filter column is in the sort key and none has a granule-level skip index, the
queries can't jump to matching rows. The current workaround (`swaps/svm.sql`,
`transfers/svm.sql`) uses the `prj_<col>_by_minute` projections to find the **minutes** each
filter appears in, intersects them, and restricts the main timestamp scan to those minutes.

This has two problems (see PR #556 discussion):

1. **Correctness — under-return.** Multi-filter queries cap the candidate set at
   `(limit+offset)*10` minutes (the `*10` heuristic). Minute-level presence ≠ row-level
   co-match, so when filters co-occur sparsely the capped window can hold fewer than `limit`
   actual matches and older matches are silently dropped.
2. **Performance — minute coarseness.** A minute holds ~12,675 swaps (~1.5 granules). A
   temporally-sparse token (e.g. `Fe5c…` ≈ 1 swap/min) has ~1 matching row per granule, but the
   scan reads the **whole** candidate minutes — ~10–100M rows to surface 10 results (2–10 s).

A query-only fix was prototyped and rejected: removing/raising the cap makes the
selective-multi-filter case (e.g. `input_mint=Fe5c + output_mint=wSOL`) read the driver
filter's full minute footprint and **time out** (9 s → >120 s). Correct-and-fast is not
achievable while "minute" is the finest pruning unit. This needs a schema change.

---

## 2. Recommended fix — `bloom_filter` data-skipping indexes (primary)

Add per-granule `bloom_filter` skip indexes on the high-cardinality filter columns, then
**delete the entire minute machinery** and let the queries be a plain ordered scan.

### DDL (swaps; mirror for transfers)

```sql
ALTER TABLE `solana:svm-dex@v0.5.2`.swaps
  ADD INDEX idx_bf_input_mint  input_mint  TYPE bloom_filter(0.01) GRANULARITY 1,
  ADD INDEX idx_bf_output_mint output_mint TYPE bloom_filter(0.01) GRANULARITY 1,
  ADD INDEX idx_bf_user        user        TYPE bloom_filter(0.01) GRANULARITY 1,
  ADD INDEX idx_bf_amm_pool    amm_pool    TYPE bloom_filter(0.01) GRANULARITY 1,
  ADD INDEX idx_bf_fee_payer   fee_payer   TYPE bloom_filter(0.01) GRANULARITY 1,
  ADD INDEX idx_bf_signer      signer      TYPE bloom_filter(0.01) GRANULARITY 1;
-- signature: already covered by prj_signature_by_timestamp (and is unique) — optional bloom.
-- program_id / protocol: low-cardinality; a bloom is wasteful. Use TYPE set(0) or leave to scan.

-- Backfill existing parts (one MATERIALIZE per index; runs as a mutation):
ALTER TABLE … MATERIALIZE INDEX idx_bf_input_mint;
-- …repeat per index…

-- transfers analog: source, destination, mint, authority, fee_payer, signer
```

### Resulting query shape (replaces ~130 lines of minute logic)

```sql
SELECT … FROM swaps
WHERE (isNull({start_time}) OR timestamp >= …)         -- unchanged time bounds
  AND (isNull({end_time})   OR timestamp <= …)
  AND (empty({input_mint:Array(String)})  OR input_mint  IN {input_mint:Array(String)})
  AND (empty({output_mint:Array(String)}) OR output_mint IN {output_mint:Array(String)})
  AND …all other filters…
ORDER BY timestamp DESC, block_num DESC, transaction_index DESC, instruction_index DESC
LIMIT {limit} OFFSET {offset}
```

The `active_filters`, `minutes_union`, `filtered_minutes`/`candidate_minutes`, and the `*10`
cap all go away.

### Why it works

- Base table is sorted by `timestamp`; ClickHouse reads granules newest→oldest
  (`optimize_read_in_order`) and **early-terminates** at `offset+limit` matches.
- The bloom indexes let it **skip granules** that can't contain the requested filter value(s).
  A granule is read only if it might contain *all* active filter values → tight for
  multi-filter.
- Per-granule (8192 rows) is strictly finer than per-minute (~1.5 granules) and, crucially,
  there is **no cap** → no under-return. For a sparse token it reads ~1 granule per candidate
  row and stops once `limit` co-matches are found.

### Cost

- **Storage:** `bloom_filter(0.01)` ≈ low single-digit % of a column's compressed size; six
  indexes total a small fraction of the table — far cheaper than any projection option below.
- **Write:** each index is updated on insert/merge; modest, proportional to index size.
- **App:** the query simplification removes complexity and the `*10` correctness caveat.

### ⚠️ Must validate before adopting

The one assumption to confirm on a scratch copy: that ClickHouse 26.x combines
`bloom_filter` skip + `optimize_read_in_order` (timestamp DESC) + `LIMIT` early-termination
for this table. Validation plan in §5. If early-termination does **not** kick in (scan walks
all granules despite the index), fall back to §3.

---

## 3. Alternative — per-driver-column projection ordered by `(col, timestamp)` (fallback)

If bloom + read-in-order does not early-terminate well, add projections that physically
re-sort the data by each high-value driver column, carrying the **filter columns + PK** (not
the heavy payload columns), so a filtered top-N resolves inside the projection and only the
surviving ≤`limit` rows are fetched from the base table.

```sql
ALTER TABLE swaps ADD PROJECTION prj_input_mint
(
  SELECT input_mint, output_mint, user, amm, amm_pool, program_id, protocol,
         fee_payer, signer, timestamp, block_num, transaction_index, instruction_index
  ORDER BY input_mint, timestamp
);
-- repeat for output_mint, user, amm_pool (the common drivers)
```

Query (2-step): read PKs of matching rows from the driver projection (tight `(col, timestamp)`
range, all filters applied, `ORDER BY timestamp DESC LIMIT offset+limit`), then fetch full
rows from the base table by those PKs.

- **Pro:** guaranteed tight (doesn't rely on skip-index early-termination); exact, no
  under-return.
- **Con:** each projection ≈ 40–70% of base size (filter columns are most of the row by
  count); 4 drivers ≈ 2–3× base storage; higher write amplification; needs the query rewrite.

Prefer §2 unless validation forces this.

---

## 4. Secondary — large-owner `balances` (`balances_by_account`)

Separate but related hot spot (PR #556 flagged it): `/v1/svm/balances` resolves an owner's
accounts then point-looks-up `balances_by_account` (keyed by `account`). An owner's accounts
are scattered across the 2.8B-row table, so each costs ~10 granules; large/whale owners
(10k–2.5M accounts) read 100M+ rows and time out. `balances_by_account` has **no `owner`
column**, so a projection on it can't co-locate by owner.

Fix is a denormalized, owner-keyed materialized view:

```sql
CREATE MATERIALIZED VIEW balances_by_owner
ENGINE = ReplacingMergeTree(block_num)
ORDER BY (owner, mint, account)
AS SELECT o.owner AS owner, b.account, b.program_id, b.mint, b.amount, b.decimals,
          b.block_num, b.timestamp
   FROM balances_by_account AS b
   INNER JOIN owner_view AS o USING (account);   -- shape TBD; needs the current-owner join
```

Then `/v1/svm/balances` reads `WHERE owner IN (…)` as a contiguous PK range (~1 granule per
owner instead of ~10 per account). Caveats: keeping it consistent with owner reassignment /
account close (the dedup logic added in PR #556 must be reflected), and the MV's own
maintenance cost. This is a larger data-modeling change than §2/§3 and warrants its own
design pass — listed here for completeness, not bundled.

---

## 5. Validation plan (do this before any prod ALTER)

On a scratch table (copy a recent slice, e.g. last 30 days of `swaps`):

1. `CREATE TABLE swaps_test AS swaps`; add the §2 bloom indexes; `INSERT` the slice (or
   `MATERIALIZE INDEX`).
2. Run the simplified §2 query for representative cases and check `EXPLAIN indexes=1` +
   `rows_read`/elapsed:
   - selective single: `input_mint=<rare token>`
   - **selective multi (the regressor): `input_mint=Fe5c… + output_mint=wSOL`** — must be
     correct (full result) and fast (target: << current 9 s, ideally <1 s, reading ~the
     driver's matching granules not whole minutes).
   - non-selective multi: `input_mint=wSOL + protocol=raydium_amm_v4` — must stay fast (dense).
   - deep `offset` and an old-data filter (value that stopped trading) — confirm
     early-termination still jumps to the old granules.
3. Confirm result sets match the current endpoint for cases where the current path is correct,
   and **return more** for a constructed under-return case.
4. Measure index storage and merge-time delta.

Only promote to prod (`ALTER TABLE … ADD INDEX` + `MATERIALIZE INDEX`, online mutation) if (2)
shows early-termination working.

---

## 6. Recommendation

1. Validate §2 (bloom skip indexes) on a scratch table — cheapest, simplest, removes the
   `*10` correctness caveat and the minute machinery entirely.
2. If early-termination doesn't engage, adopt §3 (driver projections) for `input_mint`,
   `output_mint`, `user`, `amm_pool`.
3. Track §4 (`balances_by_owner` MV) separately.

Until one of these lands, keep `swaps/svm.sql` / `transfers/svm.sql` as-is — the `*10`
heuristic is a reasonable speed/correctness compromise and the prototyped query-only rewrite
regressed the common selective-multi-filter case.
