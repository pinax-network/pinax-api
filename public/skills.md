---
name: Token API
description: Real-time token data across EVM (Ethereum, Base, BSC, Polygon, Arbitrum, ...), SVM (Solana), and TVM (TRON). Query balances, transfers, holders, DEX swaps, liquidity pools with OHLC, NFTs, and Polymarket markets.
---

# Token API

> Power your apps & AI agents with real-time token data across EVM, SVM, and TVM blockchains. This file is a quick reference for agents; the full machine-readable contract is at `GET /openapi`.

- **Base URL:** `https://token-api.thegraph.com`
- **OpenAPI spec:** `GET /openapi` — authoritative reference, use for schema details
- **Docs:** <https://thegraph.com/docs/en/token-api/quick-start/>
- **FAQ:** <https://thegraph.com/docs/en/token-api/faq/>

All responses are JSON: `{ "data": [...], ... }` for data endpoints, or a top-level object for monitoring. Errors follow `{ "status": <code>, "code": "<slug>", "message": "<text>" }`.

## Authentication

Most endpoints require a **Bearer token** from [The Graph Market](https://thegraph.market):

```
Authorization: Bearer <your-token>
```

An `X-Api-Key: <your-api-key>` header is accepted as an alternative.

**Unauthenticated endpoints** (no header required, no usage charge):
- `GET /llms.txt`
- `GET /skills.md`
- `GET /v1/health`
- `GET /v1/version`
- `GET /v1/networks`
- `GET /v1/evm/dexes`
- `GET /v1/svm/dexes`
- `GET /v1/tvm/dexes`
- `GET /v1/polymarket/markets`

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

Historical and OHLC endpoints use an `interval` enum: `1h`, `4h`, `1d` (default), `1w`.

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
