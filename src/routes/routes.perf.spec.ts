/**
 * Database performance tests — runs every perf route from scripts/perf.ts against
 * the live ClickHouse cluster and asserts that each query finishes within its
 * time budget.
 *
 * Activated by:  DB_TESTS=true bun test --timeout 30000 --bail
 *
 * How it works:
 *   1. Boot the Hono app and detect which DB categories are connected.
 *   2. For each route × network, run a warm-up request (primes ClickHouse OS page cache).
 *   3. Run the request again and measure wall-clock time.
 *   4. Assert: status 200, rows > 0, and duration ≤ threshold for the query category.
 *
 * Thresholds are intentionally generous — they catch regressions and bad SQL, not
 * normal variance.  They're derived from the benchmarks in the perf report
 * (reports/2026-02-24-transfers-perf-and-data-quality.md) with a ~3–5× safety buffer.
 */
import { beforeAll, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import {
    EVM_ADDRESS_NFT_OFFERER_EXAMPLE,
    EVM_ADDRESS_NFT_RECIPIENT_EXAMPLE,
    EVM_ADDRESS_SWAP_EXAMPLE,
    EVM_ADDRESS_SWAP_SENDER_EXAMPLE,
    EVM_ADDRESS_TO_EXAMPLE,
    EVM_ADDRESS_VITALIK_EXAMPLE,
    EVM_CONTRACT_PUDGY_PENGUINS_EXAMPLE,
    EVM_CONTRACT_USDT_EXAMPLE,
    EVM_FACTORY_UNISWAP_V3_EXAMPLE,
    EVM_POOL_USDC_WETH_EXAMPLE,
    EVM_TOKEN_ID_PUDGY_PENGUIN_EXAMPLE,
    EVM_TRANSACTION_NFT_SALE_EXAMPLE,
    EVM_TRANSACTION_SWAP_EXAMPLE,
    EVM_TRANSACTION_TRANSFER_EXAMPLE,
    SVM_ADDRESS_OWNER_EXAMPLE,
    SVM_ADDRESS_USER_EXAMPLE,
    SVM_AMM_POOL_PUMP_EXAMPLE,
    SVM_AMM_RAYDIUM_V4_EXAMPLE,
    SVM_MINT_USDC_EXAMPLE,
    SVM_MINT_WSOL_EXAMPLE,
    SVM_OWNER_USER_EXAMPLE,
    SVM_TOKEN_ACCOUNT_PUMP_EXAMPLE,
    SVM_TRANSACTION_SWAP_EXAMPLE,
    SVM_TRANSACTION_TRANSFER_EXAMPLE,
    TVM_ADDRESS_SWAP_EXAMPLE,
    TVM_CONTRACT_USDT_EXAMPLE,
    TVM_FACTORY_SUNSWAP_EXAMPLE,
    TVM_POOL_USDT_WTRX_EXAMPLE,
    TVM_TRANSACTION_SWAP_EXAMPLE,
    TVM_TRANSACTION_TRANSFER_EXAMPLE,
} from '../types/examples.js';

const DB_TESTS = !!process.env.DB_TESTS;

// ─── Time budgets (ms) ──────────────────────────────────────────────────────
//
// Each route gets a budget based on the query category.  These are generous —
// real warm-cache numbers are 2–5× lower — so a test failure means something is
// genuinely broken or regressed.
//
const BUDGET = {
    /** Bare queries (no params) — should be the fastest, 10-min clamp only. */
    bare: 1_000,
    /** Queries bounded by both start + end (block or time) — tight scan range. */
    bounded: 1_500,
    /** Queries with a single bound (start_time only, end_block only, etc.). */
    singleBound: 3_000,
    /** Filter queries (contract, address, tx_id, pool, etc.) with no time bound. */
    filter: 3_000,
    /** Filter + time/block bounded variants. */
    filterBounded: 3_000,
    /** Swap queries have two metadata joins and 9 union branches — structurally slower. */
    swapBare: 2_000,
    /** Swap filter/bounded variants. */
    swapFilter: 5_000,
    /** Lookup-style routes (tokens, balances, holders, dexes, pools, ohlcv, owner, nft state). */
    lookup: 3_000,
    /** Heavy lookup routes that scan pre-aggregated materialized views (dexes, pools).
     *  These are full-table aggregations by design — no filter optimization possible. */
    heavyLookup: 6_000,
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────

type DbCategory = 'balances' | 'transfers' | 'dex' | 'nft' | 'contracts';
type ChainType = 'evm' | 'svm' | 'tvm';

interface BenchConfig {
    startBlock: number;
    endBlock: number;
    startTime: number;
    endTime: number;
}

interface PerfRoute {
    /** Human-readable label shown in test output, e.g. "/v1/evm/transfers?contract=0x…" */
    label: string;
    /** Base path, e.g. "/v1/evm/transfers" */
    path: string;
    chain: ChainType;
    /** Query params (excluding `network=`), or a function to resolve per-network. */
    params: string | ((network: string) => string);
    requires: DbCategory[];
    /** Max allowed duration in ms. */
    budget: number;
    /** Section name override for test grouping (defaults to path-derived name). */
    section?: string;
}

// ─── Per-network bench configs ───────────────────────────────────────────────

const BENCH: Record<string, BenchConfig> = {
    mainnet: { startBlock: 21_000_000, endBlock: 21_000_005, startTime: 1727592950, endTime: 1727592960 },
    'arbitrum-one': { startBlock: 280_000_000, endBlock: 280_000_005, startTime: 1727592950, endTime: 1727592960 },
    bsc: { startBlock: 44_000_000, endBlock: 44_000_005, startTime: 1727592950, endTime: 1727592960 },
    base: { startBlock: 23_000_000, endBlock: 23_000_005, startTime: 1727592950, endTime: 1727592960 },
    avalanche: { startBlock: 75_000_000, endBlock: 75_000_005, startTime: 1727592950, endTime: 1727592960 },
    optimism: { startBlock: 140_000_000, endBlock: 140_000_005, startTime: 1727592950, endTime: 1727592960 },
    polygon: { startBlock: 80_000_000, endBlock: 80_000_005, startTime: 1727592950, endTime: 1727592960 },
    unichain: { startBlock: 38_000_100, endBlock: 38_000_300, startTime: 1768766360, endTime: 1768766370 },
    solana: { startBlock: 370_000_002, endBlock: 370_000_005, startTime: 1727592950, endTime: 1727592960 },
    tron: { startBlock: 68_000_000, endBlock: 68_000_005, startTime: 1727592950, endTime: 1727592960 },
};

const CHAIN_BENCH_DEFAULT: Record<ChainType, BenchConfig> = {
    evm: BENCH.mainnet as BenchConfig,
    svm: BENCH.solana as BenchConfig,
    tvm: BENCH.tron as BenchConfig,
};

function getBench(network: string, chain: ChainType): BenchConfig {
    return BENCH[network] ?? CHAIN_BENCH_DEFAULT[chain];
}

// ─── Per-network EVM examples ────────────────────────────────────────────────

interface EvmNetworkExamples {
    contract: string;
    transferTx: string;
    fromAddress: string;
    toAddress: string;
    swapTx: string;
    factory: string;
    pool: string;
    swapCaller: string;
    nftContract: string;
    nftTokenId: string;
    nftTransferTx: string;
    nftOfferer: string;
    nftRecipient: string;
}

const EVM_NETWORK_EXAMPLES: Record<string, EvmNetworkExamples> = {
    mainnet: {
        contract: EVM_CONTRACT_USDT_EXAMPLE,
        transferTx: EVM_TRANSACTION_TRANSFER_EXAMPLE,
        fromAddress: EVM_ADDRESS_VITALIK_EXAMPLE,
        toAddress: EVM_ADDRESS_TO_EXAMPLE,
        swapTx: EVM_TRANSACTION_SWAP_EXAMPLE,
        factory: EVM_FACTORY_UNISWAP_V3_EXAMPLE,
        pool: EVM_POOL_USDC_WETH_EXAMPLE,
        swapCaller: EVM_ADDRESS_SWAP_EXAMPLE,
        nftContract: EVM_CONTRACT_PUDGY_PENGUINS_EXAMPLE,
        nftTokenId: EVM_TOKEN_ID_PUDGY_PENGUIN_EXAMPLE,
        nftTransferTx: EVM_TRANSACTION_NFT_SALE_EXAMPLE,
        nftOfferer: EVM_ADDRESS_NFT_OFFERER_EXAMPLE,
        nftRecipient: EVM_ADDRESS_NFT_RECIPIENT_EXAMPLE,
    },
    base: {
        contract: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        transferTx: '0x4c16e19092941818b66abf33f1e617a7fe38139d368cfdac830c4aeba801faaf',
        fromAddress: '0xfd78ee919681417d192449715b2594ab58f5d002',
        toAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        swapTx: '0xa745f8345b6076a9d614e05e012fe5441c5f3f8264cc905ebdc1536e4f42370b',
        factory: '0x8909dc15e40173ff4699343b6eb8132c65e18ec6',
        pool: '0xb4cb800910b228ed3d0834cf79d697127bbb00e5',
        swapCaller: '0xcaf2da315f5a5499299a312b8a86faafe4bad959',
        nftContract: '0xd4307e0acd12cf46fd6cf93bc264f5d5d1598792',
        nftTokenId: '1',
        nftTransferTx: '0x0000000000000000000000000000000000000000000000000000000000000000',
        nftOfferer: '0x0000000000000000000000000000000000000000',
        nftRecipient: '0x0000000000000000000000000000000000000000',
    },
    bsc: {
        contract: '0x55d398326f99059ff775485246999027b3197955',
        transferTx: '0x2737cf9716e8cafa9ead9a4ca33974205e9f111c3868fc46dea8909739d8c353',
        fromAddress: '0xd5825b9e771bac21eaa89e2138b70c9faea4be6b',
        toAddress: '0x6d3ebc288a9ff9aa2d852d52b79946760eb17671',
        swapTx: '0x8298d13e67ac42408c6960f7cdd0ec0b45859e30959efb1b2f46b38229807d17',
        factory: '0xca143ce32fe78f1f7019d7d551a6402fc5350c73',
        pool: '0x16b9a82891338f9ba80e2d6970fdda79d1eb0dae',
        swapCaller: '0x9999b0cdd35d7f3b281ba02efc0d228486940515',
        nftContract: '0x0a8901b0e25deb55a87524f0cc164e9644020eba',
        nftTokenId: '1',
        nftTransferTx: '0x0000000000000000000000000000000000000000000000000000000000000000',
        nftOfferer: '0x0000000000000000000000000000000000000000',
        nftRecipient: '0x0000000000000000000000000000000000000000',
    },
    'arbitrum-one': {
        contract: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        transferTx: '0xb4f5e28ced25edf949861bf5b62ad911c892d4ff5bb8a25093ed8a07e903ed9b',
        fromAddress: '0x85304ba7b9ade0268014e07bbcc2f368c2cda335',
        toAddress: '0x3d784b0067ad72f0b271e9d0bd4c69ea7d40ae12',
        swapTx: '0x9c795270b1547ea9a65d91e2d1dedf92135378ad6518d82c5f1877df7ca0e65e',
        factory: '0x1f98431c8ad98523631ae4a59f267346ea31f984',
        pool: '0xc6962004f452be9203591991d15f6b388e09e8d0',
        swapCaller: '0x27920e8039d2b6e93e36f5d5f53b998e2e631a70',
        nftContract: '0xfae39ec09730ca0f14262a636d2d7c5539353752',
        nftTokenId: '1',
        nftTransferTx: '0x0000000000000000000000000000000000000000000000000000000000000000',
        nftOfferer: '0x0000000000000000000000000000000000000000',
        nftRecipient: '0x0000000000000000000000000000000000000000',
    },
    avalanche: {
        contract: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e',
        transferTx: '0xad2a06d95d84eeefbfe8c6ba54f14ac3a34f300e0f3f135e716ca0a4c8f94fcd',
        fromAddress: '0xfd78ee919681417d192449715b2594ab58f5d002',
        toAddress: '0x487a305e32cb7c5a7564fdec6b7920057fe7de4a',
        swapTx: '0xd4e5e330f9b1f5b1886a83b9f529c43990f94c21074dfca583cf915b06139a52',
        factory: '0x9ad6c38be94206ca50bb0d90783181662f0cfa10',
        pool: '0xfae3f424a0a47706811521e3ee268f00cfb5c45e',
        swapCaller: '0x808ce8dec9e10bed8d0892aceef9f1b8ec2f52bd',
        nftContract: '0x4245a1bd84eb5f3ebc115b2e169c99cc898305ce',
        nftTokenId: '1',
        nftTransferTx: '0x0000000000000000000000000000000000000000000000000000000000000000',
        nftOfferer: '0x0000000000000000000000000000000000000000',
        nftRecipient: '0x0000000000000000000000000000000000000000',
    },
    optimism: {
        contract: '0x4200000000000000000000000000000000000006',
        transferTx: '0xcc902c6571bee8366cbead0d821d70e5696258412bf6a5d7243e3ca5ed24228a',
        fromAddress: '0x5520385bfcf07ec87c4c53a7d8d65595dff69fa4',
        toAddress: '0x000010036c0190e009a000d0fc3541100a07380a',
        swapTx: '0x47cc220af6845d3048366d183dd136d128cb985e1c27296b7078ff6f22f74448',
        factory: '0x1f98431c8ad98523631ae4a59f267346ea31f984',
        pool: '0xd1f1bad4c9e6c44dec1e9bf3b94902205c5cd6c3',
        swapCaller: '0x549f7822e78b783720c86513f14a38a7dbceda28',
        nftContract: '0xb8df6cc3050cc02f967db1ee48330ba23276a492',
        nftTokenId: '1',
        nftTransferTx: '0x0000000000000000000000000000000000000000000000000000000000000000',
        nftOfferer: '0x0000000000000000000000000000000000000000',
        nftRecipient: '0x0000000000000000000000000000000000000000',
    },
    polygon: {
        contract: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
        transferTx: '0xb8b4d1d7b174132f8864b3f1077310cfc9e6b8f4727b164126ff29df56ec9889',
        fromAddress: '0xece6886c64c3ac8f83e302a6a71fcb015135d298',
        toAddress: '0x71c1dd2a39ca3581a3ab647f715c769708197f52',
        swapTx: '0x228c4a4568b510bf63c3f30a5cc4899dfa90d85f80acde988545437161d0ddc0',
        factory: '0x5757371414417b8c6caad45baef941abc7d3ab32',
        pool: '0x882df4b0fb50a229c3b4124eb18c759911485bfb',
        swapCaller: '0xee2a7b2c72217f6ebf0401dabb407c7a600d910f',
        nftContract: '0xa5f1ea7df861952863df2e8d1312f7305dabf215',
        nftTokenId: '1',
        nftTransferTx: '0x0000000000000000000000000000000000000000000000000000000000000000',
        nftOfferer: '0x0000000000000000000000000000000000000000',
        nftRecipient: '0x0000000000000000000000000000000000000000',
    },
    unichain: {
        contract: '0x4200000000000000000000000000000000000006',
        transferTx: '0x5ad0c0da4c43c03376859e1a08e9dc6ae21eadd82ca86c0e79e1dff32d40ee09',
        fromAddress: '0x4d73a4411ca1c660035e4aecc8270e5dddec8c17',
        toAddress: '0x65081cb48d74a32e9ccfed75164b8c09972dbcf1',
        swapTx: '0x40b02dd08d9cf4813079a02d6e25c8ba52beeb49d2c7352a87427f1e39e0cba6',
        factory: '0x1f98400000000000000000000000000000000004',
        pool: '0x9bdd72519ad7e2b5f0d5441d7af389771cc04a8406cd577fac0c68a8b6b396bd',
        swapCaller: '0xec9da8a9ed3eefe99f5d675562764a8e1d77a14e',
        nftContract: '0x0000000000000000000000000000000000000000',
        nftTokenId: '1',
        nftTransferTx: '0x0000000000000000000000000000000000000000000000000000000000000000',
        nftOfferer: '0x0000000000000000000000000000000000000000',
        nftRecipient: '0x0000000000000000000000000000000000000000',
    },
};

function getEvmExamples(network: string): EvmNetworkExamples {
    return EVM_NETWORK_EXAMPLES[network] ?? (EVM_NETWORK_EXAMPLES.mainnet as EvmNetworkExamples);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveParams(params: string | ((network: string) => string), network: string): string {
    return typeof params === 'function' ? params(network) : params;
}

// ─── Route builders (mirror scripts/perf.ts) ─────────────────────────────────

function timeBlockVariants(
    path: string,
    chain: ChainType,
    requires: DbCategory[],
    budgetBare: number,
    budgetSingleBound: number,
    budgetBounded: number,
    extraParams: string | ((network: string) => string) = ''
): PerfRoute[] {
    const resolve = (n: string) => {
        const ep = typeof extraParams === 'function' ? extraParams(n) : extraParams;
        return ep ? `${ep}&` : '';
    };
    const resolveExtra = (n: string) => {
        const ep = typeof extraParams === 'function' ? extraParams(n) : extraParams;
        return ep;
    };
    const makeLabel = (suffix: string, n?: string) => {
        const ep = n ? resolveExtra(n) : typeof extraParams === 'string' ? extraParams : '(dynamic)';
        const base = ep ? `${path}?${ep}` : path;
        return suffix ? `${base}&${suffix}` : base;
    };

    return [
        { label: makeLabel(''), path, chain, params: extraParams, requires, budget: budgetBare },
        {
            label: makeLabel('start_block=…'),
            path,
            chain,
            requires,
            budget: budgetSingleBound,
            params: (n) => `${resolve(n)}start_block=${getBench(n, chain).startBlock}`,
        },
        {
            label: makeLabel('end_block=…'),
            path,
            chain,
            requires,
            budget: budgetSingleBound,
            params: (n) => `${resolve(n)}end_block=${getBench(n, chain).endBlock}`,
        },
        {
            label: makeLabel('start_block=…&end_block=…'),
            path,
            chain,
            requires,
            budget: budgetBounded,
            params: (n) =>
                `${resolve(n)}start_block=${getBench(n, chain).startBlock}&end_block=${getBench(n, chain).endBlock}`,
        },
        {
            label: makeLabel('start_time=…'),
            path,
            chain,
            requires,
            budget: budgetSingleBound,
            params: (n) => `${resolve(n)}start_time=${getBench(n, chain).startTime}`,
        },
        {
            label: makeLabel('end_time=…'),
            path,
            chain,
            requires,
            budget: budgetSingleBound,
            params: (n) => `${resolve(n)}end_time=${getBench(n, chain).endTime}`,
        },
        {
            label: makeLabel('start_time=…&end_time=…'),
            path,
            chain,
            requires,
            budget: budgetBounded,
            params: (n) =>
                `${resolve(n)}start_time=${getBench(n, chain).startTime}&end_time=${getBench(n, chain).endTime}`,
        },
    ];
}

function filterVariants(
    path: string,
    chain: ChainType,
    requires: DbCategory[],
    budget: number,
    filters: Record<string, string | ((network: string) => string)>
): PerfRoute[] {
    return Object.entries(filters).map(([key, value]) => ({
        label: `${path}?${key}=…`,
        path,
        chain,
        params: typeof value === 'function' ? (n: string) => `${key}=${value(n)}` : `${key}=${value}`,
        requires,
        budget,
    }));
}

function lookup(
    path: string,
    chain: ChainType,
    requires: DbCategory[],
    params: string | ((network: string) => string) = '',
    budget: number = BUDGET.lookup
): PerfRoute {
    const lbl = typeof params === 'string' ? (params ? `${path}?${params}` : path) : `${path}?(dynamic)`;
    return { label: lbl, path, chain, params, requires, budget, section: 'Lookups' };
}

// ─── Route table ─────────────────────────────────────────────────────────────

const PERF_ROUTES: PerfRoute[] = [
    // ── Lookups (tokens, balances, holders, dexes, pools, ohlcv, owner) ──────
    lookup('/v1/evm/tokens', 'evm', ['balances', 'transfers'], (n) => `contract=${getEvmExamples(n).contract}`),
    lookup('/v1/evm/tokens/native', 'evm', ['balances']),
    lookup('/v1/svm/tokens', 'svm', ['balances'], `mint=${SVM_MINT_WSOL_EXAMPLE}`),
    lookup('/v1/tvm/tokens', 'tvm', ['transfers'], `contract=${TVM_CONTRACT_USDT_EXAMPLE}`),
    lookup('/v1/tvm/tokens/native', 'tvm', ['transfers']),
    lookup('/v1/evm/balances', 'evm', ['balances'], `address=${EVM_ADDRESS_VITALIK_EXAMPLE}`),
    lookup('/v1/evm/balances/native', 'evm', ['balances'], `address=${EVM_ADDRESS_VITALIK_EXAMPLE}`),
    lookup('/v1/evm/balances/historical', 'evm', ['balances'], `address=${EVM_ADDRESS_VITALIK_EXAMPLE}`),
    lookup('/v1/evm/balances/historical/native', 'evm', ['balances'], `address=${EVM_ADDRESS_VITALIK_EXAMPLE}`),
    lookup('/v1/svm/balances', 'svm', ['balances'], `owner=${SVM_OWNER_USER_EXAMPLE}`),
    lookup('/v1/svm/balances/native', 'svm', ['balances'], `address=${SVM_ADDRESS_OWNER_EXAMPLE}`),
    lookup('/v1/evm/holders', 'evm', ['balances', 'contracts'], (n) => `contract=${getEvmExamples(n).contract}`),
    lookup('/v1/evm/holders/native', 'evm', ['balances', 'contracts']),
    lookup('/v1/svm/holders', 'svm', ['balances'], `mint=${SVM_MINT_WSOL_EXAMPLE}`),
    lookup('/v1/evm/dexes', 'evm', ['dex'], '', BUDGET.heavyLookup),
    lookup('/v1/svm/dexes', 'svm', ['dex']),
    lookup('/v1/tvm/dexes', 'tvm', ['dex']),
    lookup('/v1/evm/pools', 'evm', ['dex'], '', BUDGET.heavyLookup),
    lookup('/v1/svm/pools', 'svm', ['dex'], '', BUDGET.heavyLookup),
    lookup('/v1/tvm/pools', 'tvm', ['dex']),
    lookup('/v1/evm/pools/ohlc', 'evm', ['dex'], (n) => `pool=${getEvmExamples(n).pool}`),
    lookup('/v1/svm/pools/ohlc', 'svm', ['dex', 'balances'], `amm_pool=${SVM_AMM_POOL_PUMP_EXAMPLE}`),
    lookup('/v1/tvm/pools/ohlc', 'tvm', ['dex'], `pool=${TVM_POOL_USDT_WTRX_EXAMPLE}`),
    lookup('/v1/svm/owner', 'svm', ['balances'], `account=${SVM_TOKEN_ACCOUNT_PUMP_EXAMPLE}`),

    // ── EVM Transfers ────────────────────────────────────────────────────────
    ...timeBlockVariants('/v1/evm/transfers', 'evm', ['transfers'], BUDGET.bare, BUDGET.singleBound, BUDGET.bounded),
    ...filterVariants('/v1/evm/transfers', 'evm', ['transfers'], BUDGET.filter, {
        transaction_id: (n) => getEvmExamples(n).transferTx,
        contract: (n) => getEvmExamples(n).contract,
        from_address: (n) => getEvmExamples(n).fromAddress,
        to_address: (n) => getEvmExamples(n).toAddress,
    }),
    ...timeBlockVariants(
        '/v1/evm/transfers',
        'evm',
        ['transfers'],
        BUDGET.filterBounded,
        BUDGET.filterBounded,
        BUDGET.filterBounded,
        (n) => `contract=${getEvmExamples(n).contract}`
    ),
    lookup('/v1/evm/transfers/native', 'evm', ['transfers'], '', BUDGET.bare),

    // ── SVM Transfers ────────────────────────────────────────────────────────
    ...timeBlockVariants('/v1/svm/transfers', 'svm', ['transfers'], BUDGET.bare, BUDGET.singleBound, BUDGET.bounded),
    ...filterVariants('/v1/svm/transfers', 'svm', ['transfers'], BUDGET.filter, {
        signature: SVM_TRANSACTION_TRANSFER_EXAMPLE,
        mint: SVM_MINT_WSOL_EXAMPLE,
        authority: SVM_OWNER_USER_EXAMPLE,
    }),
    ...timeBlockVariants(
        '/v1/svm/transfers',
        'svm',
        ['transfers'],
        BUDGET.filterBounded,
        BUDGET.filterBounded,
        BUDGET.filterBounded,
        `mint=${SVM_MINT_WSOL_EXAMPLE}`
    ),

    // ── TVM Transfers ────────────────────────────────────────────────────────
    ...timeBlockVariants('/v1/tvm/transfers', 'tvm', ['transfers'], BUDGET.bare, BUDGET.singleBound, BUDGET.bounded),
    ...filterVariants('/v1/tvm/transfers', 'tvm', ['transfers'], BUDGET.filter, {
        transaction_id: TVM_TRANSACTION_TRANSFER_EXAMPLE,
        contract: TVM_CONTRACT_USDT_EXAMPLE,
        from_address: TVM_ADDRESS_SWAP_EXAMPLE,
    }),
    ...timeBlockVariants(
        '/v1/tvm/transfers',
        'tvm',
        ['transfers'],
        BUDGET.filterBounded,
        BUDGET.filterBounded,
        BUDGET.filterBounded,
        `contract=${TVM_CONTRACT_USDT_EXAMPLE}`
    ),
    lookup('/v1/tvm/transfers/native', 'tvm', ['transfers'], '', BUDGET.bare),

    // ── EVM Swaps ────────────────────────────────────────────────────────────
    ...timeBlockVariants('/v1/evm/swaps', 'evm', ['dex'], BUDGET.swapBare, BUDGET.swapFilter, BUDGET.swapFilter),
    ...filterVariants('/v1/evm/swaps', 'evm', ['dex'], BUDGET.swapFilter, {
        transaction_id: (n) => getEvmExamples(n).swapTx,
        factory: (n) => getEvmExamples(n).factory,
        pool: (n) => getEvmExamples(n).pool,
        caller: (n) => getEvmExamples(n).swapCaller,
        user: (n) => getEvmExamples(n).swapCaller,
        sender: (n) => (n === 'mainnet' ? EVM_ADDRESS_SWAP_SENDER_EXAMPLE : getEvmExamples(n).swapCaller),
        recipient: (n) => getEvmExamples(n).swapCaller,
        input_contract: (n) => getEvmExamples(n).contract,
        output_contract: (n) => getEvmExamples(n).contract,
    }),
    ...timeBlockVariants(
        '/v1/evm/swaps',
        'evm',
        ['dex'],
        BUDGET.swapFilter,
        BUDGET.swapFilter,
        BUDGET.swapFilter,
        (n) => `pool=${getEvmExamples(n).pool}`
    ),

    // ── SVM Swaps ────────────────────────────────────────────────────────────
    ...timeBlockVariants('/v1/svm/swaps', 'svm', ['dex'], BUDGET.bare, BUDGET.singleBound, BUDGET.bounded),
    ...filterVariants('/v1/svm/swaps', 'svm', ['dex'], BUDGET.filter, {
        signature: SVM_TRANSACTION_SWAP_EXAMPLE,
        amm: SVM_AMM_RAYDIUM_V4_EXAMPLE,
        amm_pool: SVM_AMM_POOL_PUMP_EXAMPLE,
        user: SVM_ADDRESS_USER_EXAMPLE,
        input_mint: SVM_MINT_WSOL_EXAMPLE,
        output_mint: SVM_MINT_USDC_EXAMPLE,
    }),
    ...timeBlockVariants(
        '/v1/svm/swaps',
        'svm',
        ['dex'],
        BUDGET.filterBounded,
        BUDGET.filterBounded,
        BUDGET.filterBounded,
        `amm_pool=${SVM_AMM_POOL_PUMP_EXAMPLE}`
    ),

    // ── TVM Swaps ────────────────────────────────────────────────────────────
    ...timeBlockVariants('/v1/tvm/swaps', 'tvm', ['dex'], BUDGET.swapBare, BUDGET.swapFilter, BUDGET.swapFilter),
    ...filterVariants('/v1/tvm/swaps', 'tvm', ['dex'], BUDGET.swapFilter, {
        transaction_id: TVM_TRANSACTION_SWAP_EXAMPLE,
        factory: TVM_FACTORY_SUNSWAP_EXAMPLE,
        pool: TVM_POOL_USDT_WTRX_EXAMPLE,
        caller: TVM_ADDRESS_SWAP_EXAMPLE,
        user: TVM_ADDRESS_SWAP_EXAMPLE,
        sender: TVM_ADDRESS_SWAP_EXAMPLE,
        recipient: TVM_ADDRESS_SWAP_EXAMPLE,
        input_contract: TVM_CONTRACT_USDT_EXAMPLE,
        output_contract: TVM_CONTRACT_USDT_EXAMPLE,
    }),
    ...timeBlockVariants(
        '/v1/tvm/swaps',
        'tvm',
        ['dex'],
        BUDGET.swapFilter,
        BUDGET.swapFilter,
        BUDGET.swapFilter,
        `pool=${TVM_POOL_USDT_WTRX_EXAMPLE}`
    ),

    // ── NFT ──────────────────────────────────────────────────────────────────
    lookup('/v1/evm/nft/collections', 'evm', ['contracts', 'nft'], (n) => `contract=${getEvmExamples(n).nftContract}`),
    lookup('/v1/evm/nft/holders', 'evm', ['nft'], (n) => `contract=${getEvmExamples(n).nftContract}`),
    lookup('/v1/evm/nft/items', 'evm', ['nft'], (n) => `contract=${getEvmExamples(n).nftContract}`),
    lookup('/v1/evm/nft/ownerships', 'evm', ['nft'], (n) => `address=${getEvmExamples(n).nftOfferer}`),
    lookup('/v1/evm/nft/sales', 'evm', ['nft']),
    ...timeBlockVariants('/v1/evm/nft/transfers', 'evm', ['nft'], BUDGET.bare, BUDGET.singleBound, BUDGET.bounded),
    ...filterVariants('/v1/evm/nft/transfers', 'evm', ['nft'], BUDGET.filter, {
        type: 'TRANSFER',
        transaction_id: (n) => getEvmExamples(n).nftTransferTx,
        contract: (n) => getEvmExamples(n).nftContract,
        token_id: (n) => getEvmExamples(n).nftTokenId,
        address: (n) => getEvmExamples(n).nftOfferer,
        from_address: (n) => getEvmExamples(n).nftOfferer,
        to_address: (n) => getEvmExamples(n).nftRecipient,
    }),
    ...timeBlockVariants(
        '/v1/evm/nft/transfers',
        'evm',
        ['nft'],
        BUDGET.filterBounded,
        BUDGET.filterBounded,
        BUDGET.filterBounded,
        (n) => `contract=${getEvmExamples(n).nftContract}`
    ),
];

// ─── Test runner ─────────────────────────────────────────────────────────────

let app: Hono;
let evmNetwork: string;
let svmNetwork: string;
let tvmNetwork: string;

function getNetworkForChain(chain: ChainType): string {
    switch (chain) {
        case 'evm':
            return evmNetwork;
        case 'svm':
            return svmNetwork;
        case 'tvm':
            return tvmNetwork;
    }
}

async function fetchRoute(url: string): Promise<{ status: number; body: any; duration_ms: number }> {
    const start = performance.now();
    const response = await app.request(url, { headers: { 'X-Plan': 'free', 'Cache-Control': 'no-cache' } });
    const body = await response.json();
    const duration_ms = Math.round((performance.now() - start) * 100) / 100;
    return { status: response.status, body, duration_ms };
}

// ─── Collect failures for the summary ────────────────────────────────────────

interface TestResult {
    label: string;
    network: string;
    status: number;
    duration_ms: number;
    rows: number;
    budget: number;
    passed: boolean;
    reason?: string;
}

const allResults: TestResult[] = [];

// ─── Test suite ──────────────────────────────────────────────────────────────

describe.skipIf(!DB_TESTS)('Database performance', () => {
    beforeAll(async () => {
        const { config } = await import('../config.js');
        // Bypass plan limits for tests
        (config as any).plans = null;

        app = new Hono();
        const routes = await import('./index.js');
        app.route('/', routes.default);

        evmNetwork = config.defaultEvmNetwork;
        svmNetwork = config.defaultSvmNetwork;
        tvmNetwork = config.defaultTvmNetwork;
    });

    // Group routes by section for readable output
    const sections = new Map<string, PerfRoute[]>();
    for (const route of PERF_ROUTES) {
        let section: string;
        if (route.section) {
            section = route.section;
        } else {
            const parts = route.path.split('/'); // ['', 'v1', 'evm', 'transfers']
            const chain = (parts[2] ?? '').toUpperCase();
            const category = parts.slice(3).join('/');
            section = `${chain} ${category.charAt(0).toUpperCase()}${category.slice(1)}`;
        }
        if (!sections.has(section)) sections.set(section, []);
        sections.get(section)?.push(route);
    }

    for (const [sectionName, routes] of sections) {
        describe(sectionName, () => {
            for (const route of routes) {
                it(route.label, async () => {
                    const { config } = await import('../config.js');
                    const { hasDatabase } = await import('../supported-routes.js');

                    const network = getNetworkForChain(route.chain);
                    const hasAllDbs = route.requires.every((cat) => hasDatabase(config, network, cat));
                    if (!hasAllDbs) return; // skip — DB not connected

                    const params = resolveParams(route.params, network);
                    const url = params
                        ? `${route.path}?network=${network}&${params}`
                        : `${route.path}?network=${network}`;

                    // ── Warm-up (prime ClickHouse page cache) ────────
                    await fetchRoute(url);

                    // ── Measured run ──────────────────────────────────
                    const { status, body, duration_ms } = await fetchRoute(url);
                    const rows = Array.isArray(body?.data) ? body.data.length : 0;

                    const passed = status === 200 && duration_ms <= route.budget;
                    let reason: string | undefined;
                    if (status !== 200) {
                        reason = `HTTP ${status}`;
                    } else if (duration_ms > route.budget) {
                        reason = `${duration_ms}ms > ${route.budget}ms budget`;
                    }

                    allResults.push({
                        label: route.label,
                        network,
                        status,
                        duration_ms,
                        rows,
                        budget: route.budget,
                        passed,
                        reason,
                    });

                    if (!passed) {
                        expect.unreachable(`[${network}] ${reason} (${rows} rows) — ${url}`);
                    }
                });
            }
        });
    }

    // ── Summary test (always runs last) ──────────────────────────────────────
    describe('Summary', () => {
        it('prints performance summary', () => {
            if (allResults.length === 0) return;

            const passed = allResults.filter((r) => r.passed);
            const failed = allResults.filter((r) => !r.passed);
            const totalTime = allResults.reduce((s, r) => s + r.duration_ms, 0);
            const avgTime = Math.round(totalTime / allResults.length);

            console.log('\n┌─────────────────────────────────────────────');
            console.log('│  DATABASE PERFORMANCE SUMMARY');
            console.log('├─────────────────────────────────────────────');
            console.log(`│  Total queries:  ${allResults.length}`);
            console.log(`│  Passed:         ${passed.length}`);
            console.log(`│  Failed:         ${failed.length}`);
            console.log(`│  Total time:     ${Math.round(totalTime)}ms`);
            console.log(`│  Average:        ${avgTime}ms`);

            if (allResults.length > 0) {
                const sorted = [...allResults].sort((a, b) => a.duration_ms - b.duration_ms);
                const fastest = sorted[0];
                const slowest = sorted[sorted.length - 1];
                console.log(`│  Fastest:        ${fastest?.duration_ms}ms — ${fastest?.label} [${fastest?.network}]`);
                console.log(`│  Slowest:        ${slowest?.duration_ms}ms — ${slowest?.label} [${slowest?.network}]`);
            }

            if (failed.length > 0) {
                console.log('├─────────────────────────────────────────────');
                console.log('│  ❌ FAILED QUERIES:');
                for (const f of failed) {
                    console.log(`│    [${f.network}] ${f.label} — ${f.reason}`);
                }
            }

            const zeroRows = allResults.filter((r) => r.status === 200 && r.rows === 0);
            if (zeroRows.length > 0) {
                console.log('├─────────────────────────────────────────────');
                console.log('│  💀 ZERO ROWS RETURNED:');
                for (const z of zeroRows) {
                    console.log(`│    [${z.network}] ${z.label} — ${z.duration_ms}ms`);
                }
            }

            console.log('└─────────────────────────────────────────────\n');

            // Don't fail on summary — individual tests already reported failures
        });
    });
});
