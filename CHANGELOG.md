# Changelog

## 3.10.0

### Minor Changes

- Added batch query support and `total_transfers` field to `/tokens` endpoint for EVM/TVM ([#337](https://github.com/pinax-network/pinax-api/pull/337))
- Added `indexed_to` per DB category to `/networks` response and simplified `/health` to DB connection verification ([#381](https://github.com/pinax-network/pinax-api/pull/381))
- Refactored routes to flatten structure, colocate SQL files, and use single router ([#346](https://github.com/pinax-network/pinax-api/pull/346))
- Added server init logging for clusters, networks, databases, and supported routes ([#352](https://github.com/pinax-network/pinax-api/pull/352), [#366](https://github.com/pinax-network/pinax-api/pull/366))
- Replaced `readSQL` with Bun native text imports for SQL files ([#355](https://github.com/pinax-network/pinax-api/pull/355))
- Added SQL route tests with `DB_TESTS` flag and performance testing script ([#356](https://github.com/pinax-network/pinax-api/pull/356), [#368](https://github.com/pinax-network/pinax-api/pull/368))
- Removed inject logic (except Web3icons), moved stables/natives to `src/registry/` ([#353](https://github.com/pinax-network/pinax-api/pull/353))
- Removed Changesets tooling ([#344](https://github.com/pinax-network/pinax-api/pull/344))

### Patch Changes

- Fixed wrong CTE alias in EVM tokens query ORDER BY ([#342](https://github.com/pinax-network/pinax-api/pull/342))
- Replaced sentinel default values with NULL in SQL query parameters ([#364](https://github.com/pinax-network/pinax-api/pull/364))
- Reuse EVM SQL for identical TVM routes ([#372](https://github.com/pinax-network/pinax-api/pull/372))
- Removed all references to `injectSymbol` ([#338](https://github.com/pinax-network/pinax-api/pull/338))
- Removed maximum bar rate limits from plans ([#340](https://github.com/pinax-network/pinax-api/pull/340))
- Added Bun cache to test workflow ([#358](https://github.com/pinax-network/pinax-api/pull/358))

## 3.9.0

### Minor Changes

- 0bc5652: Removed spam scoring functionality

### Patch Changes

- 0382494: Fix caller/sender filter column mismatch in swaps query

## 3.8.1

### Patch Changes

- ac5bfd4: - Filter by minute as the very first filter
  - Filter by minute,timestamp afterwards
  - Remove ORDER BY \*, log_ordinal DESC since it's not in the ORDER BY table (when it's not optimized, causes issues to have no-ORDER BY fields in the ORDER BY)
- 02ae871: Update metadata contracts

## 3.8.0

### Minor Changes

- 9b6a5e7: Refactored database configuration to allow splitting token database into balances and transfers databases
- 19b31a7: Added support for multi-cluster database configuration via YAML file

### Patch Changes

- 538b32b: Fixed Scalar UI visual issues

## 3.7.2

### Patch Changes

- 830834f: Fix wrong `sender` field value for swaps

## 3.7.0

### Minor Changes

- e81a1f7: Updated SQL queries for svm-tokens@v0.2.8, svm-dex@v0.3.1, tvm-tokens@v0.2.0, evm-dex@v0.2.5, evm-tokens@v1.17.4
- e81a1f7: Added new EVM protocols: `curve`, `balancer`, `bancor`, `uniswap_v1`
- e81a1f7: Added `/tvm/pools` endpoint

## 3.6.3

### Patch Changes

- 613be58: Fix missing endpoints parameters in OpenAPI spec

## 3.6.2

### Patch Changes

- 09ab459: Improve local development experience by setting `X-Plan` header to `free` by default
- cfcb314: Remove `BETA` tags from OpenAPI and HTML pages
- fa67cc1: Fix plan limits not being properly enforced for OHLCV endpoints

## 3.6.1

### Patch Changes

- da0c035: Fixed bug with incorrect pool field in `/evm/swaps` endpoint
- 16a03cd: Fixed bug with incomplete results in `/tvm/swaps` response on deep pagination

## 3.6.0

### Minor Changes

- 80897c2: Added /tvm/tokens metadata endpoint
- bb7e180: Added `/svm/holders` endpoint to query top token holders for native and SPL tokens

### Patch Changes

- d399598: Updated dependencies
- 21db6da: Fixed bug with deep pagination in _/transfers and _/swaps endpoints
- ac43cd7: Fix wrong response schemas in the OpenAPI specification
- a673363: Improved query performance by disabling HTTP keep-alive in ClickHouse client
- 2ea4ae8: Fix logging for incoming requests to Token API

## 3.5.5

### Patch Changes

- 3ed1242: Remove authentication requirements showing up in OpenAPI spec for `/dexes` endpoints

## 3.5.4

### Patch Changes

- f2de5b5: Fix plan limits interval validation
- 5480681: Fixed ClickHouse streaming exception handling
- 1670488: Improve datetime response schema
- 5480681: Migrate from `hono-openapi` v0 to v1
- 5480681: Refactored `*/dexes` endpoints
- 5480681: Improve `/tvm/transfers` performance
- 5480681: Improved `/svm/balances` performance

## [3.5.3] - 2024-11-07

### Fixed

- Fix tron order by, include `block_hash` ([#265](https://github.com/pinax-network/pinax-api/pull/265))

## [3.5.2] - 2024-11-06

### Fixed

- Fix TVM ORDER BY for swaps and transfers ([#263](https://github.com/pinax-network/pinax-api/pull/263))

## [3.5.1] - 2024-11-05

### Added

- Add indexes to TVM endpoint responses ([#262](https://github.com/pinax-network/pinax-api/pull/262))

## [3.5.0] - 2024-11-04

### Added

- Add TVM endpoints ([#256](https://github.com/pinax-network/pinax-api/pull/256))

### Changed

- Optimize query time windows to use latest ingested timestamp ([#258](https://github.com/pinax-network/pinax-api/pull/258))
- Refactor spam scoring ([#259](https://github.com/pinax-network/pinax-api/pull/259))

## [3.4.1] - 2024-10-31

### Fixed

- Fix sorting in `/evm/holders` ([#255](https://github.com/pinax-network/pinax-api/pull/255))

### Changed

- Optimize `/evm/holders` ([#257](https://github.com/pinax-network/pinax-api/pull/257))

## [3.4.0] - 2024-10-30

**Breaking**: This version requires new materialized views in the EVM and Solana schemas.

### Added

- Add version mismatch check for GH release action ([#252](https://github.com/pinax-network/pinax-api/pull/252))

### Changed

- Optimize `/evm/transfers` ([#250](https://github.com/pinax-network/pinax-api/pull/250))
- Optimize `/svm/swaps` ([#253](https://github.com/pinax-network/pinax-api/pull/253))
- Optimize `/evm/swaps` ([#254](https://github.com/pinax-network/pinax-api/pull/254))

## [3.3.3] - 2024-10-28

### Added

- Added SOL Native metadata to `/svm/transfers`

## [3.3.2] - 2024-10-27

### Fixed

- Minor bug fixes
