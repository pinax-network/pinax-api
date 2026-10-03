#!/usr/bin/env bun
/**
 * Stablecoin coverage test for Token API.
 *
 * Reads stablecoins data and checks which stablecoins exist on networks
 * we support in dbs-config vs. chains we don't index.
 *
 * Usage:
 *   bun scripts/test-stablecoins.ts                          # full report
 *   bun scripts/test-stablecoins.ts --network mainnet         # filter by network
 *   bun scripts/test-stablecoins.ts --min-balance 100000000   # min $100M market cap
 *   bun scripts/test-stablecoins.ts --config path/to/dbs.yaml # custom config
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

// ─── Platform name → Token API network ID (from dbs-config) ───
const PLATFORM_TO_NETWORK: Record<string, string> = {
    // Direct matches
    ethereum: 'mainnet',
    solana: 'solana',
    // EVM L1s
    'binance-smart-chain': 'bsc',
    'polygon-pos': 'polygon',
    avalanche: 'avalanche',
    fantom: 'fantom',
    cronos: 'cronos',
    celo: 'celo',
    xdai: 'gnosis',
    kava: 'kava',
    moonbeam: 'moonbeam',
    moonriver: 'moonriver',
    harmony: 'harmony',
    aurora: 'aurora',
    // EVM L2s
    'arbitrum-one': 'arbitrum-one',
    'optimistic-ethereum': 'optimism',
    base: 'base',
    linea: 'linea',
    scroll: 'scroll',
    zksync: 'zksync-era',
    blast: 'blast-mainnet',
    mantle: 'mantle',
    mode: 'mode-mainnet',
    'manta-pacific': 'manta-pacific-mainnet',
    boba: 'boba',
    'metis-andromeda': 'metis',
    'polygon-zkevm': 'polygon-zkevm',
    'arbitrum-nova': 'arbitrum-nova',
    fraxtal: 'fraxtal',
    // New EVM chains
    sonic: 'sonic',
    'sei-v2': 'sei-mainnet',
    berachain: 'berachain',
    hyperevm: 'hyperevm',
    'world-chain': 'worldchain',
    unichain: 'unichain',
    'x-layer': 'xlayer',
    plasma: 'plasma',
    monad: 'monad',
    'klay-token': 'kaia',
    ink: 'ink',
    katana: 'katana',
    'flare-network': 'flare',
    starknet: 'starknet',
    'plume-network': 'plume',
};

// ─── Types ───
interface StablecoinEntry {
    id: string;
    symbol: string;
    name: string;
    market_cap: number;
    contracts: { chain: string; address: string }[];
}

interface NormalizedToken {
    symbol: string;
    name: string;
    network: string;
    rawChain: string;
    address: string;
    value: number; // market_cap or balance
}

// ─── Load dbs-config networks ───
function loadNetworks(configPath: string): Set<string> {
    if (!existsSync(configPath)) {
        console.error(`dbs-config not found at ${configPath}`);
        process.exit(1);
    }
    const raw = parse(readFileSync(configPath, 'utf-8'));
    return new Set(Object.keys(raw.networks || {}));
}

function formatUsd(n: number): string {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
}

function loadStablecoins(path: string): NormalizedToken[] {
    const data: StablecoinEntry[] = JSON.parse(readFileSync(path, 'utf-8'));
    const tokens: NormalizedToken[] = [];
    for (const coin of data) {
        for (const c of coin.contracts) {
            const network = PLATFORM_TO_NETWORK[c.chain] || c.chain;
            tokens.push({
                symbol: coin.symbol.toUpperCase(),
                name: coin.name,
                network,
                rawChain: c.chain,
                address: c.address,
                value: coin.market_cap,
            });
        }
    }
    return tokens;
}

// ─── Helpers ───
interface ChainSummary {
    network: string;
    tokens: Map<string, NormalizedToken>; // deduped by address
    marketCap: number;
}

/** Dedupe tokens by address and compute per-chain summary. */
function summarizeByChain(tokens: NormalizedToken[]): ChainSummary[] {
    const byChain = new Map<string, Map<string, NormalizedToken>>();
    for (const t of tokens) {
        let map = byChain.get(t.network);
        if (!map) {
            map = new Map();
            byChain.set(t.network, map);
        }
        const key = t.address.toLowerCase();
        if (!map.has(key)) map.set(key, t);
    }
    const summaries: ChainSummary[] = [];
    for (const [network, tokenMap] of byChain) {
        let marketCap = 0;
        for (const t of tokenMap.values()) marketCap += t.value;
        summaries.push({ network, tokens: tokenMap, marketCap });
    }
    return summaries.sort((a, b) => b.marketCap - a.marketCap);
}

function printTable(header: string[], rows: string[][], indent = 2) {
    const colWidths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] || '').length)));
    const pad = ' '.repeat(indent);
    const sep = colWidths.map((w) => '─'.repeat(w + 2)).join('┼');
    const fmtRow = (r: string[]) =>
        r.map((c, i) => ` ${i === 0 ? c.padEnd(colWidths[i] ?? 0) : c.padStart(colWidths[i] ?? 0)} `).join('│');

    console.log(`${pad}┌${sep.replaceAll('┼', '┬')}┐`);
    console.log(`${pad}│${fmtRow(header)}│`);
    console.log(`${pad}├${sep}┤`);
    for (const row of rows) {
        console.log(`${pad}│${fmtRow(row)}│`);
    }
    console.log(`${pad}└${sep.replaceAll('┼', '┴')}┘`);
}

// ─── Main ───
function main() {
    const args = process.argv.slice(2);
    const filterNetwork = args.includes('--network') ? args[args.indexOf('--network') + 1] : null;
    const minBalance = args.includes('--min-balance')
        ? Number.parseInt(args[args.indexOf('--min-balance') + 1] ?? '0', 10)
        : 0;
    const configArg = args.includes('--config') ? args[args.indexOf('--config') + 1] : null;

    // Load stablecoin data
    const dataPath = resolve(import.meta.dir, 'stablecoins.json');
    if (!existsSync(dataPath)) {
        console.error('stablecoins.json not found. Run: bun scripts/fetch-stablecoins.ts');
        process.exit(1);
    }
    let tokens = loadStablecoins(dataPath);

    if (minBalance > 0) {
        tokens = tokens.filter((t) => t.value >= minBalance);
    }

    // Load supported networks
    const configPath =
        configArg || process.env.DBS_CONFIG_PATH || resolve(import.meta.dir, '../dbs-config.yaml.example');
    const supportedNetworks = loadNetworks(configPath);

    // Classify
    const supported: NormalizedToken[] = [];
    const unsupported: NormalizedToken[] = [];
    for (const t of tokens) {
        (supportedNetworks.has(t.network) ? supported : unsupported).push(t);
    }

    // Apply --network filter for display
    const filteredSupported = filterNetwork ? supported.filter((t) => t.network === filterNetwork) : supported;
    const supportedChains = summarizeByChain(filteredSupported);
    const unsupportedChains = summarizeByChain(unsupported);

    const totalSupportedCap = supportedChains.reduce((s, c) => s + c.marketCap, 0);
    const totalUnsupportedCap = unsupportedChains.reduce((s, c) => s + c.marketCap, 0);
    const totalCap = totalSupportedCap + totalUnsupportedCap;
    const coveragePct = totalCap > 0 ? ((totalSupportedCap / totalCap) * 100).toFixed(1) : '0.0';

    // ─── Header ───
    const now = new Date().toISOString().slice(0, 10);
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                       STABLECOIN COVERAGE REPORT — TOKEN API                           ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════════════════╝');
    console.log(`  Date: ${now}`);
    console.log(`  Config: ${configPath}`);
    console.log(`  Total stablecoins in dataset: ${tokens.length} token-chain pairs`);
    if (minBalance > 0) console.log(`  Filter: market cap ≥ ${formatUsd(minBalance)}`);
    if (filterNetwork) console.log(`  Filter: network = ${filterNetwork}`);
    console.log('');

    // ─── Grand summary box ───
    console.log('┌──────────────────────────────────────────────────────────────┐');
    console.log(
        `│  ✅ Supported    ${String(supportedChains.length).padStart(3)} chains   ${formatUsd(totalSupportedCap).padStart(12)} market cap  │`
    );
    console.log(
        `│  ❌ Unsupported  ${String(unsupportedChains.length).padStart(3)} chains   ${formatUsd(totalUnsupportedCap).padStart(12)} market cap  │`
    );
    console.log(`│  📊 Coverage     ${coveragePct.padStart(5)}%    of total stablecoin market cap    │`);
    console.log('└──────────────────────────────────────────────────────────────┘');
    console.log('');

    // ─── Supported chains breakdown ───
    console.log('═'.repeat(90));
    console.log('  ✅ SUPPORTED CHAINS — BREAKDOWN');
    console.log('═'.repeat(90));

    const supportedRows = supportedChains.map((c) => [
        c.network,
        String(c.tokens.size),
        formatUsd(c.marketCap),
        totalCap > 0 ? `${((c.marketCap / totalCap) * 100).toFixed(1)}%` : '—',
    ]);
    supportedRows.push(['', '', '', '']);
    supportedRows.push([
        'TOTAL',
        String(supportedChains.reduce((s, c) => s + c.tokens.size, 0)),
        formatUsd(totalSupportedCap),
        `${coveragePct}%`,
    ]);
    printTable(['Network', 'Tokens', 'Market Cap', '% of Total'], supportedRows);

    // Per-chain token details
    for (const chain of supportedChains) {
        const toks = [...chain.tokens.values()].sort((a, b) => b.value - a.value);
        console.log(`\n  ${chain.network}  (${toks.length} tokens, ${formatUsd(chain.marketCap)} combined)`);
        console.log(`  ${'─'.repeat(76)}`);
        for (const t of toks) {
            const pct = chain.marketCap > 0 ? ((t.value / chain.marketCap) * 100).toFixed(0) : '0';
            console.log(
                `    ${t.symbol.padEnd(10)} ${t.address.padEnd(46)} ${formatUsd(t.value).padStart(10)} ${(`${pct}%`).padStart(5)}`
            );
        }
    }

    // ─── Unsupported chains breakdown ───
    console.log(`\n${'═'.repeat(90)}`);
    console.log('  ❌ UNSUPPORTED CHAINS — BREAKDOWN');
    console.log('═'.repeat(90));

    const unsupportedRows = unsupportedChains.map((c) => [c.network, String(c.tokens.size), formatUsd(c.marketCap)]);
    unsupportedRows.push(['', '', '']);
    unsupportedRows.push([
        'TOTAL',
        String(unsupportedChains.reduce((s, c) => s + c.tokens.size, 0)),
        formatUsd(totalUnsupportedCap),
    ]);
    printTable(['Chain', 'Tokens', 'Market Cap'], unsupportedRows);

    // ─── Biggest gaps (unsupported chains by market cap) ───
    const topGaps = unsupportedChains.slice(0, 15);
    if (topGaps.length > 0) {
        console.log('\n  💡 TOP UNSUPPORTED CHAINS BY MARKET CAP (coverage opportunities)');
        console.log(`  ${'─'.repeat(76)}`);
        for (const [i, c] of topGaps.entries()) {
            const topSymbols = [...c.tokens.values()]
                .sort((a, b) => b.value - a.value)
                .slice(0, 3)
                .map((t) => t.symbol)
                .join(', ');
            console.log(
                `    ${String(i + 1).padStart(2)}. ${c.network.padEnd(28)} ${formatUsd(c.marketCap).padStart(12)}   ${c.tokens.size} tokens  (${topSymbols})`
            );
        }
    }

    // ─── Top stablecoins across all supported chains ───
    console.log(`\n${'═'.repeat(90)}`);
    console.log('  🏆 TOP 20 STABLECOINS ON SUPPORTED CHAINS');
    console.log('═'.repeat(90));

    // Dedupe globally by symbol, summing across chains
    const bySymbol = new Map<string, { symbol: string; totalCap: number; chains: string[] }>();
    for (const chain of supportedChains) {
        for (const t of chain.tokens.values()) {
            const existing = bySymbol.get(t.symbol);
            if (existing) {
                existing.totalCap += t.value;
                if (!existing.chains.includes(chain.network)) existing.chains.push(chain.network);
            } else {
                bySymbol.set(t.symbol, { symbol: t.symbol, totalCap: t.value, chains: [chain.network] });
            }
        }
    }
    const topTokens = [...bySymbol.values()].sort((a, b) => b.totalCap - a.totalCap).slice(0, 20);
    const topRows = topTokens.map((t, i) => [
        String(i + 1),
        t.symbol,
        formatUsd(t.totalCap),
        String(t.chains.length),
        t.chains.slice(0, 5).join(', ') + (t.chains.length > 5 ? ` +${t.chains.length - 5}` : ''),
    ]);
    printTable(['#', 'Symbol', 'Market Cap', 'Chains', 'Networks'], topRows);

    console.log('');
}

main();
