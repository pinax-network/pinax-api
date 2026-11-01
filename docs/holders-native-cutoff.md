# Native holders cutoff

`holders-native-cutoff` sets, per EVM network, the balance in whole native tokens from which `/v1/evm/holders/native` ranks holders. It trades how many holders the route serves against how much each request reads.

## What it does

- **With a cutoff**, the route ranks every holder of at least that many tokens by balance, exactly (`src/routes/holders/evm_native.sql`). Pages end at the last of them: past it, a page comes back short, then empty. A request reads only the addresses with a stored balance at or above the cutoff, through the balance min-max skip index, and their latest rows. A higher cutoff reads less but serves fewer holders.
- **At `0`**, the route ranks every address with a positive balance, to any depth (`evm_native_all.sql`), but each request reads the whole `native_balances` table: seconds and hundreds of CPU-seconds on large networks.

`native_balances` is a `ReplacingMergeTree` keyed by address. An address keeps its older rows until its parts merge, and the sinks write new parts every block. The route therefore ranks each address by its latest row, and drops any address whose latest balance is below the cutoff, even if an older row is above it.

## Defaults

A network without the key uses its default from `DEFAULT_HOLDERS_NATIVE_CUTOFFS` in `src/config/dbsConfig.ts`. Networks not listed there default to `0`.

| Network | Default | Holders at it | Request at `0` | Request at the default | For the top 500 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ethereum | 7,500 ETH | 1,346 | 4.0 s, 134 CPU-s | 0.41 s, 10 CPU-s | 15,000 (0.28 s) |
| Base | 20 ETH | 1,381 | 5.2 s, 176 CPU-s | 1.71 s, 54 CPU-s | 40 (1.03 s) |
| BSC | 400 BNB | 1,245 | 9.4 s, 320 CPU-s | 1.30 s, 40 CPU-s | 750 (0.91 s) |
| Arbitrum One | 20 ETH | 1,297 | 1.4 s, 44 CPU-s | 0.58 s, 17 CPU-s | 40 (0.42 s) |
| Polygon | 125,000 POL | 1,304 | 3.0 s, 99 CPU-s | 0.71 s, 21 CPU-s | 250,000 (0.50 s) |
| Optimism | 4 ETH | 1,458 | 0.53 s, 15 CPU-s | 0.35 s, 9 CPU-s | 7.5 (0.30 s) |
| Avalanche | 5,000 AVAX | 1,553 | 0.46 s, 13 CPU-s | 0.26 s, 6 CPU-s | 15,000 (0.21 s) |
| Unichain | 0 | all | 0.25 s, 6 CPU-s | the same | 0 |
| HyperEVM | 0 | all | 0.08 s, 1 CPU-s | the same | 0 |
| Others | 0 | all | not measured | the same | not measured |

**How the defaults were chosen.** Each keeps the top 1,000 holders exact with a 20% margin. It is the highest round value at or below the 1,200th holder's balance, where round means 1, 1.5, 2, 2.5, 3, 4, 5 or 7.5 times a power of ten (125,000 on Polygon). The top-500 values follow the same rule at the 600th holder.

**Why Unichain and HyperEVM default to 0.** A cutoff saved under 0.1 s per request there, so they rank every holder.

**Where the numbers come from.** They were measured on 2026-10-31 on idle copies of the staging databases: `<network>:evm-balances-native@v0.7.11` (Polygon v0.7.12) and `avalanche:evm-balances@v0.3.4`. Each time is page 1 at `limit=10`, the faster of two runs. A loaded cluster is slower, and another database for the same network can hold a different number of holders at the same value. Count them before relying on a default there.

## Picking a value

To keep the top N holders exact, pick a cutoff at or below the N-th holder's balance, with a margin for holders who cross it later, and otherwise as high as possible.

This counts the holders at or above a value. Replace `W` with the value in wei: tokens × 10^18.

```sql
SELECT count() FROM (
    SELECT argMax(balance, block_num) AS b FROM native_balances
    WHERE address IN (SELECT address FROM native_balances WHERE balance >= toUInt256('W'))
    GROUP BY address
) WHERE b >= toUInt256('W');
```

Set it per network in `dbs-config.yaml` (decimals allowed, up to 18). `0` ranks every address:

```yaml
networks:
  bsc:
    type: evm
    cluster: default
    balances-native: bsc:evm-balances-native@v0.7.11
    holders-native-cutoff: 750 # the top 500 instead of the default's 1,000
```
