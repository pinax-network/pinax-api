# Release Notes — v3.10.0

## Highlights

- 🏗️ **Major route refactor** — Flattened the entire `src/routes/` directory structure, colocated SQL files next to route handlers, and consolidated ~30 intermediate router files into a single router ([#346](https://github.com/pinax-network/pinax-api/pull/346))
- 🔍 **`/networks` now includes `indexed_to`** — Each network entry returns per-category sync status (block number, datetime, version) for transfers, balances, and dexes databases ([#381](https://github.com/pinax-network/pinax-api/pull/381))
- 📦 **Batch support for `/tokens`** — The `/tokens` endpoint now accepts batched contract/mint queries and returns `total_transfers` for EVM/TVM ([#337](https://github.com/pinax-network/pinax-api/pull/337))

---

## API

### New Features

- **Batch queries on `/tokens`** — Added batched `contract`/`mint` query params and new `circulating_supply`, `holders`, and `total_transfers` response fields for EVM, SVM, and TVM token endpoints ([#337](https://github.com/pinax-network/pinax-api/pull/337))
- **`indexed_to` in `/networks` response** — Each network object now includes an `indexed_to` array with sync status per DB category (transfers, balances, dexes), including `version`, `block_num`, `datetime`, and `timestamp` ([#381](https://github.com/pinax-network/pinax-api/pull/381))
- **Network filter on `/networks`** — Added optional batched `network` query param to filter results by network ID ([#381](https://github.com/pinax-network/pinax-api/pull/381))
- **Removed rate limit maximums** — Removed maximum bar rate limits from API plans ([#340](https://github.com/pinax-network/pinax-api/pull/340))

### Bug Fixes

- **Fixed EVM tokens ORDER BY** — Corrected wrong CTE alias in EVM tokens query causing incorrect sort order ([#342](https://github.com/pinax-network/pinax-api/pull/342))
- **NULL defaults for SQL params** — Replaced sentinel default values (`-1`, `0x0000...`) with `NULL` in SQL query parameters, improving correctness of optional filters ([#364](https://github.com/pinax-network/pinax-api/pull/364))

### Improvements

- **Reuse EVM SQL for TVM routes** — Identical TVM routes now share EVM SQL queries, reducing duplication ([#372](https://github.com/pinax-network/pinax-api/pull/372))

---

## Server

### Architecture

- **Flattened route structure** — Restructured `src/routes/` from deeply nested `v1/evm/svm/tvm` hierarchy to flat feature-based folders with all chain variants colocated. Eliminated ~30 intermediate `index.ts` router files in favor of a single route registration file ([#346](https://github.com/pinax-network/pinax-api/pull/346))
- **Colocated SQL files** — Moved SQL files from centralized `src/sql/` directory to sit next to their route handlers (e.g., `tokens/evm.ts` + `tokens/evm.sql`) ([#346](https://github.com/pinax-network/pinax-api/pull/346))
- **Bun native SQL imports** — Replaced `readSQL()` file loading with Bun's native text imports for SQL files ([#355](https://github.com/pinax-network/pinax-api/pull/355))

### Health & Monitoring

- **Simplified `/health` endpoint** — Stripped down to simple DB connection verification (ping each ClickHouse cluster), removing degraded/skipped status logic and API endpoint self-testing ([#381](https://github.com/pinax-network/pinax-api/pull/381))
- **Server init logging** — Added structured logging at startup for configured clusters, networks, databases, and routes ([#352](https://github.com/pinax-network/pinax-api/pull/352))
- **Supported vs unsupported route logging** — Server init now logs which routes are supported/unsupported based on the current DB configuration ([#366](https://github.com/pinax-network/pinax-api/pull/366))

### Code Cleanup

- **Removed inject modules** — Deleted unused `injectPrices`, `injectSymbol`, and associated code. Kept only Web3icons injection. Moved stablecoin/native token registries to `src/registry/` ([#353](https://github.com/pinax-network/pinax-api/pull/353), [#338](https://github.com/pinax-network/pinax-api/pull/338))
- **Removed Changesets** — Removed changeset tooling entirely from the project ([#344](https://github.com/pinax-network/pinax-api/pull/344))

### Testing & Performance

- **SQL route tests** — Added basic SQL tests per route with a `DB_TESTS` flag for opt-in database integration testing ([#356](https://github.com/pinax-network/pinax-api/pull/356))
- **Performance testing script** — Added `scripts/perf.ts` for benchmarking all API routes, with multi-network support, `Cache-Control: no-cache` headers, and zero-row detection ([#368](https://github.com/pinax-network/pinax-api/pull/368), [#374](https://github.com/pinax-network/pinax-api/pull/374), [#376](https://github.com/pinax-network/pinax-api/pull/376), [#378](https://github.com/pinax-network/pinax-api/pull/378))
- **CI caching** — Added Bun cache to the test workflow for faster CI runs ([#358](https://github.com/pinax-network/pinax-api/pull/358))

---

**Full Changelog**: https://github.com/pinax-network/pinax-api/compare/v3.9.0...v3.10.0
