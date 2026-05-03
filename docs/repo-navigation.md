# Repo Navigation Guide

This document captures stable, tool-agnostic navigation knowledge for the `token-api` codebase.

## 1) Workspace layout

- `index.ts`: runtime entrypoint; initializes Hono app, OpenAPI handler, static docs routes, and mounts API routes.
- `src/routes/`: endpoint modules grouped by domain (`balances`, `tokens`, `transfers`, `swaps`, `pools`, `dexes`, `holders`, `nft`, `owner`, monitoring routes).
- `src/routes/index.ts`: global route registration and cache-control middleware wiring.
- `src/config.ts`: runtime config surface (CLI/env), defaults, validation, and derived network lists.
- `src/config/dbsConfig.ts`: parses `dbs-config.yaml`, validates clusters/networks, and builds per-category DB maps.
- `src/clickhouse/`: ClickHouse client creation and query execution/streaming.
- `src/handleQuery.ts`: shared query execution wrapper, pagination defaults, API response envelope, and error mapping.
- `src/types/zod.ts`: shared schema primitives and query builders used by route handlers.
- `src/middleware/`: cross-cutting middleware (`cacheControl`, `nativeContractRedirect`).
- `src/registry/`: native/stable token lookup helpers.
- `src/services/`: secondary services (`redis`, spam scoring).
- `src/sql/`: SQL normalization utilities.
- `scripts/`: maintenance and analysis scripts (perf, query logs, stablecoins, query breakdown generation).
- `queries/`: SQL reference breakdowns consumed by script workflows.
- `reports/`: checked-in analysis/performance reports (documentation artifacts, not runtime code).
- `public/`: static files served by app (`index.html`, `skills.md`, `llms.txt`, assets).
- `.github/workflows/`: CI and release automation entrypoints.

## 2) Architecture mental model (request/data flow)

1. Request enters `index.ts` and is routed to `src/routes/index.ts` under `/v1/*`.
2. Route-level middleware applies cache-control defaults/overrides and route-specific hooks.
3. Route handler validates query/path input with schemas from `src/types/zod.ts`.
4. Handler maps requested `network` to ClickHouse DB mapping from config (`balancesDatabases`, `transfersDatabases`, etc.).
5. Handler loads SQL text (`*.sql` colocated with route module) and calls `makeUsageQueryJson`.
6. `src/handleQuery.ts` injects pagination defaults, normalizes SQL, and calls `src/clickhouse/makeQuery.ts`.
7. ClickHouse client is selected per-network/cluster (`src/clickhouse/client.ts`) and response is streamed.
8. API envelope (`data`, `statistics`, pagination, timings) is returned or mapped to structured API errors.

## 3) Common task routing (what to edit for X)

- Add a new endpoint:
  - Create route module in `src/routes/<domain>/...ts`.
  - Add SQL in colocated `src/routes/<domain>/...sql` when query-based.
  - Register route in `src/routes/index.ts`.
  - Add/adjust shared schemas in `src/types/zod.ts` if needed.

- Change query behavior or fields for an existing endpoint:
  - Edit endpoint SQL in colocated `src/routes/**/<name>.sql`.
  - Update response/query schemas in corresponding route `*.ts` file.

- Change request validation rules globally:
  - Edit base schemas and helpers in `src/types/zod.ts`.

- Change network/database mapping behavior:
  - Edit YAML parsing + transformation in `src/config/dbsConfig.ts`.
  - Edit config defaults/derived lists in `src/config.ts`.

- Change cache behavior:
  - Header logic: `src/middleware/cacheControl.ts`.
  - Route-level cache policy assignment: `src/routes/index.ts`.

- Change ClickHouse transport/query execution:
  - Connection/auth/cluster routing: `src/clickhouse/client.ts`.
  - Streaming, stats, query error handling: `src/clickhouse/makeQuery.ts` and `src/handleQuery.ts`.

- Change static docs or landing assets:
  - Edit `public/index.html`, `public/skills.md`, `public/llms.txt`, and media in `public/`.

- Update CI/release behavior:
  - Edit `.github/workflows/*.yml`.

## 4) Key commands / build-run-test anchors

From `package.json` scripts:

- `bun dev`: start local API with watch mode.
- `bun start`: start API once (no watch).
- `bun build`: compile standalone binary (`token-api`).
- `bun test`: unit/integration tests with coverage.
- `bun test:db`: DB-backed test run (`DB_TESTS=true`).
- `bun lint`: TypeScript check + Biome check.
- `bun fix`: apply Biome fixes.
- `bun perf`: run performance script (`scripts/perf.ts`).
- `bun query-log`: run query logging script (`scripts/query-log.ts`).

CI anchors:

- `.github/workflows/bun-test.yml`: install, lint, test.
- `.github/workflows/release.yml`: version bump/changelog automation on release.
- `.github/workflows/docker-develop.yml` and `docker-release.yml`: image publishing.

## 5) Source vs generated/artifact directories

Primary source-of-truth directories:

- `src/`, `scripts/`, `queries/`, `public/`, `.github/workflows/`, `docs/`.

Generated or install/build artifacts:

- `node_modules/`: dependency install artifact.
- `token-api`: compiled binary output from `bun build`.
- `coverage/` (when tests run with coverage): generated report artifact.
- `dist/` (TypeScript outDir in config, if generated locally).

Operational note:

- Runtime network support is configuration-driven via `dbs-config.yaml`, not hardcoded to a single static list.
