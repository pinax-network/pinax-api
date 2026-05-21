---
name: pinax-api
description: >
  Query Pinax API datasets, including Token API for EVM/SVM/TVM token data,
  prediction markets, and perp exchange data. Use when: integrating with Pinax
  API, choosing endpoints, building API requests, handling pagination, or
  discovering supported networks.
---

# Pinax API

> Quick reference for AI agents using Pinax API. The authoritative machine-readable contract is `GET /openapi`.

- **Base URL:** `https://api.pinax.network`
- **OpenAPI spec:** `GET /openapi` — authoritative reference, use for schema details
- **Docs:** <https://thegraph.com/docs/en/token-api/quick-start/>
- **FAQ:** <https://thegraph.com/docs/en/token-api/faq/>
- **Canonical skill file:** `GET /SKILL.md`

All responses are JSON: `{ "data": [...], ... }` for data endpoints, or a top-level object for monitoring. Errors follow `{ "status": <code>, "code": "<slug>", "message": "<text>" }`.

## Authentication

Most endpoints require a **Bearer token** from [The Graph Market](https://thegraph.market):

```
Authorization: Bearer <your-token>
```

An `X-Api-Key: <your-api-key>` header is accepted as an alternative.

**Unauthenticated endpoints** (no header required, no usage charge):
- `GET /llms.txt`
- `GET /SKILL.md`
- `GET /skills/SKILL.md` (alias)
- `GET /SKILLS.md` (alias)
- `GET /skills.md` (alias)
- `GET /v1/health`
- `GET /v1/version`
- `GET /v1/networks`
- `GET /v1/evm/dexes`
- `GET /v1/svm/dexes`
- `GET /v1/tvm/dexes`
- `GET /v1/polymarket/markets`
- `GET /v1/hyperliquid/dexes`
- `GET /v1/hyperliquid/markets`

## Errors

Error responses share a common envelope:

```json
{
  "status": 400,
  "code": "bad_query_input",
  "message": "Invalid network ID"
}
```

Common codes: `bad_query_input` (400), `authentication_failed` (401), `route_not_found` (404), `bad_database_response` (500), `database_connection_failed` (503).

## Capabilities

Map a goal to the relevant dataset and endpoint family:

- **Token API: look up wallet balances and transfer history** — `/v1/{evm,svm,tvm}/balances`, `/v1/{evm,svm,tvm}/transfers`
- **Token API: track balance changes over time** — `/v1/evm/balances/historical`, `/v1/evm/balances/historical/native`
- **Token API: resolve token metadata** — `/v1/{evm,svm,tvm}/tokens`, `/v1/{evm,svm,tvm}/tokens/native`
- **Token API: find holders of a token** — `/v1/{evm,svm}/holders`, `/v1/evm/holders/native`, `/v1/evm/nft/holders`
- **Token API: trace DEX swaps and liquidity pools** — `/v1/{evm,svm,tvm}/swaps`, `/v1/{evm,svm,tvm}/pools`, `/v1/{evm,svm,tvm}/dexes`
- **Token API: get OHLC time-series** — `/v1/{evm,svm,tvm}/pools/ohlc`
- **Token API: list a wallet's NFT holdings and activity** — `/v1/evm/nft/ownerships`, `/v1/evm/nft/transfers`, `/v1/evm/nft/sales`, `/v1/evm/nft/items`, `/v1/evm/nft/collections`
- **Prediction Markets: discover markets, OI, and per-user PNL** — `/v1/polymarket/markets`, `/v1/polymarket/markets/ohlc`, `/v1/polymarket/markets/oi`, `/v1/polymarket/markets/activity`, `/v1/polymarket/users`, `/v1/polymarket/users/positions`
- **Perp Exchanges: discover markets, OHLC, OI, liquidations, and per-user PnL** — `/v1/hyperliquid/markets`, `/v1/hyperliquid/markets/ohlc`, `/v1/hyperliquid/markets/oi`, `/v1/hyperliquid/markets/liquidations`, `/v1/hyperliquid/users`, `/v1/hyperliquid/users/positions`, `/v1/hyperliquid/vaults`
- **Discover supported chains and protocols** (free) — `/v1/networks`, `/v1/{evm,svm,tvm}/dexes`, `/v1/hyperliquid/dexes`

## Common patterns

These conventions apply across the data endpoints unless overridden.

### Pagination

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | `10` | Items per page. Maximum is plan-restricted (free tier capped lower). |
| `page` | integer | `1` | Page number. An empty `data` array signals end of results. |

### Batched filters

Any parameter marked "supports multiple" accepts either a repeated query param (`?contract=0x..&contract=0x..`) or a comma-separated list (`?contract=0x..,0x..`). This applies to most ID-shaped filters (`address`, `contract`, `mint`, `token_id`, `pool`, `transaction_id`, `signature`, etc.).

### Time ranges

Event and historical endpoints accept either block or time windows:

- `start_time` / `end_time` — ISO 8601 or Unix timestamp (seconds)
- `start_block` / `end_block` — integer block number (slot for SVM)

### Intervals

Historical and OHLC endpoints use an `interval` enum: `1h`, `4h`, `1d` (default), `1w`. A few endpoints accept additional values (e.g. `/v1/polymarket/users` supports `30d`); the OpenAPI per-endpoint schema is authoritative.

### Network discovery

Call `GET /v1/networks` first to enumerate supported network IDs (`mainnet`, `base`, `bsc`, `solana`, `tron`, …) and see how current each indexer is via `indexed_to`.

## Worked example

Fetch WETH balances for a wallet on Ethereum:

```
1. GET /v1/networks                              → confirm "mainnet" is indexed
2. GET /v1/evm/tokens?network=mainnet
        &contract=0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
                                                 → resolve WETH metadata
3. GET /v1/evm/balances?network=mainnet
        &address=0x<wallet>
        &contract=0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
                                                 → current balance
4. GET /v1/evm/balances/historical?network=mainnet
        &address=0x<wallet>
        &contract=0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
        &interval=1d&start_time=2026-01-01       → time-series
```

---

## Monitoring

| Endpoint | Required | Optional | Notes |
|----------|----------|----------|-------|
| `GET /v1/health` | — | — | `200` when all DBs are up, `503` otherwise |
| `GET /v1/version` | — | — | Version, build date, commit |
| `GET /v1/networks` | — | `network` | Supported chains + `indexed_to` per category; `network` filter is batched |

---

## EVM endpoints

Ethereum and compatible chains (Ethereum, Base, BSC, Polygon, Arbitrum, …).

### Tokens (ERC-20)

| Endpoint | Required | Optional |
|----------|----------|----------|
| `GET /v1/evm/tokens` | `network`, `contract` | — |
| `GET /v1/evm/tokens/native` | `network` | — |

### Balances

| Endpoint | Required | Optional |
|----------|----------|----------|
| `GET /v1/evm/balances` | `network`, `address` | `contract`, `include_null_balances` |
| `GET /v1/evm/balances/native` | `network`, `address` | — |
| `GET /v1/evm/balances/historical` | `network`, `address` | `contract`, `interval`, `start_time`, `end_time` |
| `GET /v1/evm/balances/historical/native` | `network`, `address` | `interval`, `start_time`, `end_time` |

### Transfers

| Endpoint | Required | Optional |
|----------|----------|----------|
| `GET /v1/evm/transfers` | `network` | `transaction_id`, `contract`, `from_address`, `to_address`, `start_time`, `end_time`, `start_block`, `end_block` |
| `GET /v1/evm/transfers/native` | `network` | `transaction_id`, `from_address`, `to_address`, `start_time`, `end_time`, `start_block`, `end_block` |

### Holders

| Endpoint | Required | Optional |
|----------|----------|----------|
| `GET /v1/evm/holders` | `network`, `contract` | — |
| `GET /v1/evm/holders/native` | `network` | — |

### DEX / swaps / pools

| Endpoint | Required | Optional |
|----------|----------|----------|
| `GET /v1/evm/swaps` | `network` | `transaction_id`, `transaction_from`, `factory`, `pool`, `caller`, `user`, `sender`, `recipient`, `input_contract`, `output_contract`, `protocol`, `start_time`, `end_time`, `start_block`, `end_block` |
| `GET /v1/evm/dexes` | `network` | — |
| `GET /v1/evm/pools` | `network` | `factory`, `pool`, `input_token`, `output_token`, `protocol` |
| `GET /v1/evm/pools/ohlc` | `network`, `pool` | `interval`, `start_time`, `end_time` |

Swap response includes several address fields:
- `transaction_from` — onchain transaction initiator
- `caller` — account or contract that invokes the swap
- `user` — normalized user-oriented swap address; **prefer this for new integrations**
- `sender`, `recipient` — legacy fields, slated for deprecation in a future major release

### NFTs

| Endpoint | Required | Optional |
|----------|----------|----------|
| `GET /v1/evm/nft/collections` | `network`, `contract` | — |
| `GET /v1/evm/nft/items` | `network`, `contract` | `token_id` |
| `GET /v1/evm/nft/holders` | `network`, `contract` | — |
| `GET /v1/evm/nft/ownerships` | `network`, `address` | `contract`, `token_id`, `token_standard` (`ERC721` \| `ERC1155`), `include_null_balances` |
| `GET /v1/evm/nft/transfers` | `network` | `type` (`BURN` \| `MINT` \| `TRANSFER`), `transaction_id`, `contract`, `token_id`, `address`, `from_address`, `to_address`, `start_time`, `end_time`, `start_block`, `end_block` |
| `GET /v1/evm/nft/sales` | `network` | `transaction_id`, `contract`, `token_id`, `address`, `from_address`, `to_address`, `start_time`, `end_time`, `start_block`, `end_block` |

---

## SVM endpoints

Solana Virtual Machine chains.

### Tokens (SPL)

| Endpoint | Required | Optional |
|----------|----------|----------|
| `GET /v1/svm/tokens` | `network`, `mint` | — |
| `GET /v1/svm/tokens/native` | `network` | — |

### Balances

| Endpoint | Required | Optional |
|----------|----------|----------|
| `GET /v1/svm/balances` | `network`, `owner` | `token_account`, `mint`, `program_id`, `include_null_balances` |
| `GET /v1/svm/balances/native` | `network`, `address` | `include_null_balances` |

### Transfers

| Endpoint | Required | Optional |
|----------|----------|----------|
| `GET /v1/svm/transfers` | `network` | `signature`, `source`, `destination`, `authority`, `mint`, `program_id`, `start_time`, `end_time`, `start_block`, `end_block` |
| `GET /v1/svm/transfers/native` | `network` | `signature`, `source`, `destination`, `start_time`, `end_time`, `start_block`, `end_block` |

### Holders

| Endpoint | Required | Optional |
|----------|----------|----------|
| `GET /v1/svm/holders` | `network`, `mint` | — |
| `GET /v1/svm/holders/native` | `network` | — |

In `/v1/svm/holders`, the `owner` field is the wallet and `token_account` is the Associated Token Account (ATA).

### DEX / swaps / pools

| Endpoint | Required | Optional |
|----------|----------|----------|
| `GET /v1/svm/swaps` | `network` | `signature`, `amm`, `amm_pool`, `user`, `input_mint`, `output_mint`, `program_id`, `start_time`, `end_time`, `start_block`, `end_block` |
| `GET /v1/svm/dexes` | `network` | — |
| `GET /v1/svm/pools` | `network` | `amm`, `amm_pool`, `input_mint`, `output_mint`, `program_id` |
| `GET /v1/svm/pools/ohlc` | `network`, `amm_pool` | `interval`, `start_time`, `end_time` |

### Account owner

| Endpoint | Required | Optional |
|----------|----------|----------|
| `GET /v1/svm/owner` | `network`, `account` | — |

---

## TVM endpoints

TRON Virtual Machine chains. Balances and holders are not yet exposed.

### Tokens (TRC-20)

| Endpoint | Required | Optional |
|----------|----------|----------|
| `GET /v1/tvm/tokens` | `network`, `contract` | — |
| `GET /v1/tvm/tokens/native` | `network` | — |

### Transfers

| Endpoint | Required | Optional |
|----------|----------|----------|
| `GET /v1/tvm/transfers` | `network` | `transaction_id`, `contract`, `from_address`, `to_address`, `start_time`, `end_time`, `start_block`, `end_block` |
| `GET /v1/tvm/transfers/native` | `network` | `transaction_id`, `from_address`, `to_address`, `start_time`, `end_time`, `start_block`, `end_block` |

### DEX / swaps / pools

| Endpoint | Required | Optional |
|----------|----------|----------|
| `GET /v1/tvm/swaps` | `network` | `transaction_id`, `factory`, `pool`, `caller`, `user`, `sender`, `recipient`, `input_contract`, `output_contract`, `protocol`, `start_time`, `end_time`, `start_block`, `end_block` |
| `GET /v1/tvm/dexes` | `network` | — |
| `GET /v1/tvm/pools` | `network` | `factory`, `pool`, `input_token`, `output_token`, `protocol` |
| `GET /v1/tvm/pools/ohlc` | `network`, `pool` | `interval`, `start_time`, `end_time` |

TVM swap address fields follow the same `user` / `sender` / `recipient` convention as EVM (prefer `user`).

---

## Polymarket

Prediction-market data for the Polygon-based Polymarket CTF exchange. Outcome token prices are quoted in USDC per share (0–1).

### Markets

| Endpoint | Required | Optional | Notes |
|----------|----------|----------|-------|
| `GET /v1/polymarket/markets` | — | `condition_id`, `market_slug`, `token_id`, `event_slug`, `closed`, `sort_by` (`volume` \| `end_date` \| `start_date`) | **Unauthenticated.** Discover `token_id` / `condition_id` here before calling other endpoints. |
| `GET /v1/polymarket/markets/ohlc` | `token_id` | `interval`, `start_time`, `end_time` | OHLC for a single outcome token |
| `GET /v1/polymarket/markets/oi` | — | `condition_id` **or** `market_slug` (mutually exclusive), `interval`, `start_time`, `end_time` | Open-interest time-series |
| `GET /v1/polymarket/markets/activity` | one of `user`, `token_id`, `condition_id` | `event_type` (`trade` \| `split` \| `merge` \| `redeem`), `start_time`, `end_time` | Defaults to last 24h when no time range is given |
| `GET /v1/polymarket/markets/positions` | `token_id` | `closed`, `sort_by` | Leaderboard of users holding this outcome |

### Users

| Endpoint | Required | Optional | Notes |
|----------|----------|----------|-------|
| `GET /v1/polymarket/users` | — | `user`, `interval` (`1h` \| `1d` \| `1w` \| `30d`), `sort_by` (default `total_volume`) | Per-user volume and PNL; omit `interval` for all-time |
| `GET /v1/polymarket/users/positions` | `user` | `token_id`, `condition_id`, `market_slug`, `closed`, `sort_by` | A single user's positions with PNL breakdown |

### Platform

| Endpoint | Required | Optional |
|----------|----------|----------|
| `GET /v1/polymarket/platform` | — | `interval`, `start_time`, `end_time` |

Aggregate volume, open interest, and fees across all Polymarket markets.

---

## Hyperliquid

Trading data for the Hyperliquid L1 — core perps, `@N`-indexed spot pairs, and builder-deployed DEXes (`xyz`, `cash`, …). The `coin` parameter is the canonical identifier across all `/v1/hyperliquid/*` endpoints: unprefixed for core perps (`BTC`), `@N` for spot (`@107`), and `<dex>:<symbol>` for builder DEXes (`xyz:SILVER`). Discover the live DEX set via `GET /v1/hyperliquid/dexes`.

### Markets

| Endpoint | Required | Optional | Notes |
|----------|----------|----------|-------|
| `GET /v1/hyperliquid/dexes` | — | — | **Unauthenticated.** All supported DEX ids. |
| `GET /v1/hyperliquid/markets` | — | `coin`, `dex`, `base_token`, `quote_token` | **Unauthenticated.** Latest snapshot per market: last price, 24h change, volume by side, OI, funding rate. `base_token` / `quote_token` are spot-discovery filters. |
| `GET /v1/hyperliquid/markets/ohlc` | `coin` | `dex`, `interval`, `start_time`, `end_time` | OHLCV per coin (and optional dex). |
| `GET /v1/hyperliquid/markets/oi` | `coin` | `dex`, `interval`, `start_time`, `end_time` | Open-interest time-series. Default `interval=1h`. |
| `GET /v1/hyperliquid/markets/activity` | — | `coin`, `dex`, `user`, `start_time`, `end_time` | Trade-fill stream. |
| `GET /v1/hyperliquid/markets/liquidations` | — | `coin`, `dex`, `liquidated_user`, `sort_by` (`notional` \| `time`), `start_time`, `end_time` | Per-fill liquidation feed. |
| `GET /v1/hyperliquid/markets/liquidations/ohlc` | `coin` | `dex`, `interval`, `start_time`, `end_time` | OHLCV of liquidation notional. |

### Users

| Endpoint | Required | Optional | Notes |
|----------|----------|----------|-------|
| `GET /v1/hyperliquid/users` | — | `user`, `coin`, `dex`, `interval` (`1h` \| `1d` \| `1w` \| `30d`), `sort_by` (`total_volume` \| `transactions` \| `total_fees` \| `realized_pnl` \| `total_funding` \| `liquidation_fills`) | Dual mode: profile when `user` is set, leaderboard otherwise. Omit `interval` for all-time. Refreshed hourly. |
| `GET /v1/hyperliquid/users/positions` | `user` | `coin`, `dex` | Open perp positions per user. |
| `GET /v1/hyperliquid/users/activity` | `user` | `event_types` (batched: `bridge_deposit`, `bridge_withdraw_pending`, `bridge_withdraw_finalized`, `deposit`, `withdraw`, `vault_deposit`, `vault_withdraw`, `liquidation`, `funding`), `start_time`, `end_time` | Balance-changing events. Defaults to last 30 days. For trade fills, use `/v1/hyperliquid/markets/activity`. |

### Vaults

| Endpoint | Required | Optional | Notes |
|----------|----------|----------|-------|
| `GET /v1/hyperliquid/vaults` | — | `vault`, `sort_by` (`lifetime_deposits` \| `lifetime_withdrawals` \| `lifetime_distributions` \| `depositor_count` \| `last_activity_at`) | Lifetime flow stats. Vaults predating the indexer cutover have null `leader` / `created_at`. |
| `GET /v1/hyperliquid/vaults/depositors` | `vault` | `sort_by` (`deposits` \| `withdrawals` \| `distributions_received` \| `last_activity_at`) | Per-depositor stake in a vault. |

### Platform

| Endpoint | Required | Optional |
|----------|----------|----------|
| `GET /v1/hyperliquid/platform` | — | `interval`, `start_time`, `end_time` |

Cross-coin, cross-DEX time-series of volume, fees, trade counts, and a liquidation slice.
