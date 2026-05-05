import { beforeAll, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import {
    EVM_ADDRESS_SWAP_EXAMPLE,
    EVM_ADDRESS_SWAP_SENDER_EXAMPLE,
    EVM_ADDRESS_TO_EXAMPLE,
    EVM_ADDRESS_VITALIK_EXAMPLE,
    EVM_CONTRACT_PUDGY_PENGUINS_EXAMPLE,
    EVM_CONTRACT_USDC_EXAMPLE,
    EVM_CONTRACT_USDT_EXAMPLE,
    EVM_CONTRACT_WETH_EXAMPLE,
    EVM_FACTORY_UNISWAP_V3_EXAMPLE,
    EVM_POOL_USDC_WETH_EXAMPLE,
    EVM_TRANSACTION_SWAP_EXAMPLE,
    EVM_TRANSACTION_TRANSFER_EXAMPLE,
    SVM_ADDRESS_DESTINATION_EXAMPLE,
    SVM_ADDRESS_OWNER_EXAMPLE,
    SVM_ADDRESS_USER_EXAMPLE,
    SVM_AMM_POOL_PUMP_EXAMPLE,
    SVM_AMM_RAYDIUM_V4_EXAMPLE,
    SVM_AUTHORITY_USER_EXAMPLE,
    SVM_MINT_USDC_EXAMPLE,
    SVM_MINT_WSOL_EXAMPLE,
    SVM_OWNER_USER_EXAMPLE,
    SVM_TOKEN_ACCOUNT_PUMP_EXAMPLE,
    SVM_TRANSACTION_SWAP_EXAMPLE,
    SVM_TRANSACTION_TRANSFER_EXAMPLE,
    TVM_ADDRESS_FROM_EXAMPLE,
    TVM_ADDRESS_NATIVE_TO_EXAMPLE,
    TVM_ADDRESS_SWAP_EXAMPLE,
    TVM_ADDRESS_TO_EXAMPLE,
    TVM_CONTRACT_USDT_EXAMPLE,
    TVM_CONTRACT_WTRX_EXAMPLE,
    TVM_FACTORY_SUNSWAP_EXAMPLE,
    TVM_POOL_USDT_WTRX_EXAMPLE,
    TVM_TRANSACTION_NATIVE_TRANSFER_EXAMPLE,
    TVM_TRANSACTION_SWAP_EXAMPLE,
    TVM_TRANSACTION_TRC20_TRANSFER_EXAMPLE,
} from '../types/examples.js';

const DB_TESTS = !!process.env.DB_TESTS;

let app: Hono;
let hasEvmBalances: boolean;
let hasEvmTransfers: boolean;
let hasEvmDex: boolean;
let hasEvmNft: boolean;
let hasEvmContracts: boolean;
let hasSvmBalances: boolean;
let hasSvmTransfers: boolean;
let hasSvmDex: boolean;
let hasTvmTransfers: boolean;
let hasTvmDex: boolean;
let evmNetwork: string;
let svmNetwork: string;
let tvmNetwork: string;

const MAINNET_NETWORK = 'mainnet';
const MAINNET_HEAD_BLOCK = 24_616_075;
const MAINNET_MID_BLOCK = 10_000_000;
const MAINNET_HEAD_TIMESTAMP = 1_773_013_031;
const MAINNET_MID_TIMESTAMP = 1_588_598_533;

const MAINNET_BOUNDARIES = [
    { label: 'chain head', block: MAINNET_HEAD_BLOCK, timestamp: MAINNET_HEAD_TIMESTAMP },
    { label: 'mid chain', block: MAINNET_MID_BLOCK, timestamp: MAINNET_MID_TIMESTAMP },
] as const;

const MAINNET_ROUTE_CASES = [
    { label: 'transfers', path: '/v1/evm/transfers', db: 'transfers' },
    { label: 'native transfers', path: '/v1/evm/transfers/native', db: 'transfers' },
    { label: 'swaps', path: '/v1/evm/swaps', db: 'dex' },
] as const;

const SINGLE_FILTER_ROUTE_CASES = [
    {
        chain: 'EVM',
        path: '/v1/evm/transfers',
        requires: () => hasEvmTransfers,
        network: () => evmNetwork,
        filters: [
            { param: 'transaction_id', value: EVM_TRANSACTION_TRANSFER_EXAMPLE, responsePath: ['transaction_id'] },
            { param: 'contract', value: EVM_CONTRACT_USDT_EXAMPLE, responsePath: ['contract'] },
            { param: 'from_address', value: EVM_ADDRESS_VITALIK_EXAMPLE, responsePath: ['from'] },
            { param: 'to_address', value: EVM_ADDRESS_TO_EXAMPLE, responsePath: ['to'] },
        ],
    },
    {
        chain: 'EVM',
        path: '/v1/evm/transfers/native',
        requires: () => hasEvmTransfers,
        network: () => evmNetwork,
        filters: [
            {
                param: 'transaction_id',
                value: '0xd671e7314849d87f852c3674fd98157f1faf512364640c37ea38e997f67bd088',
                responsePath: ['transaction_id'],
            },
            { param: 'from_address', value: EVM_ADDRESS_VITALIK_EXAMPLE, responsePath: ['from'] },
            { param: 'to_address', value: EVM_ADDRESS_TO_EXAMPLE, responsePath: ['to'] },
        ],
    },
    {
        chain: 'EVM',
        path: '/v1/evm/swaps',
        requires: () => hasEvmDex,
        network: () => evmNetwork,
        filters: [
            { param: 'transaction_id', value: EVM_TRANSACTION_SWAP_EXAMPLE, responsePath: ['transaction_id'] },
            { param: 'factory', value: EVM_FACTORY_UNISWAP_V3_EXAMPLE, responsePath: ['factory'] },
            { param: 'pool', value: EVM_POOL_USDC_WETH_EXAMPLE, responsePath: ['pool'] },
            { param: 'caller', value: EVM_ADDRESS_SWAP_EXAMPLE, responsePath: ['caller'] },
            { param: 'user', value: EVM_ADDRESS_SWAP_EXAMPLE, responsePath: ['user'] },
            { param: 'sender', value: EVM_ADDRESS_SWAP_SENDER_EXAMPLE, responsePath: ['sender'] },
            { param: 'recipient', value: EVM_ADDRESS_SWAP_EXAMPLE, responsePath: ['recipient'] },
            { param: 'input_contract', value: EVM_CONTRACT_USDC_EXAMPLE, responsePath: ['input_token', 'address'] },
            { param: 'output_contract', value: EVM_CONTRACT_WETH_EXAMPLE, responsePath: ['output_token', 'address'] },
            { param: 'protocol', value: 'uniswap_v3', responsePath: ['protocol'] },
        ],
    },
    {
        chain: 'TVM',
        path: '/v1/tvm/transfers',
        requires: () => hasTvmTransfers,
        network: () => tvmNetwork,
        filters: [
            {
                param: 'transaction_id',
                value: TVM_TRANSACTION_TRC20_TRANSFER_EXAMPLE,
                responsePath: ['transaction_id'],
            },
            { param: 'contract', value: TVM_CONTRACT_USDT_EXAMPLE, responsePath: ['contract'] },
            { param: 'from_address', value: TVM_ADDRESS_FROM_EXAMPLE, responsePath: ['from'] },
            { param: 'to_address', value: TVM_ADDRESS_TO_EXAMPLE, responsePath: ['to'] },
        ],
    },
    {
        chain: 'TVM',
        path: '/v1/tvm/transfers/native',
        requires: () => hasTvmTransfers,
        network: () => tvmNetwork,
        filters: [
            {
                param: 'transaction_id',
                value: TVM_TRANSACTION_NATIVE_TRANSFER_EXAMPLE,
                responsePath: ['transaction_id'],
            },
            { param: 'from_address', value: TVM_ADDRESS_FROM_EXAMPLE, responsePath: ['from'] },
            { param: 'to_address', value: TVM_ADDRESS_NATIVE_TO_EXAMPLE, responsePath: ['to'] },
        ],
    },
    {
        chain: 'TVM',
        path: '/v1/tvm/swaps',
        requires: () => hasTvmDex,
        network: () => tvmNetwork,
        filters: [
            { param: 'transaction_id', value: TVM_TRANSACTION_SWAP_EXAMPLE, responsePath: ['transaction_id'] },
            { param: 'factory', value: TVM_FACTORY_SUNSWAP_EXAMPLE, responsePath: ['factory'] },
            { param: 'pool', value: TVM_POOL_USDT_WTRX_EXAMPLE, responsePath: ['pool'] },
            { param: 'caller', value: TVM_ADDRESS_SWAP_EXAMPLE, responsePath: ['caller'] },
            { param: 'user', value: TVM_ADDRESS_SWAP_EXAMPLE, responsePath: ['user'] },
            { param: 'sender', value: TVM_ADDRESS_SWAP_EXAMPLE, responsePath: ['sender'] },
            { param: 'recipient', value: TVM_ADDRESS_SWAP_EXAMPLE, responsePath: ['recipient'] },
            { param: 'input_contract', value: TVM_CONTRACT_USDT_EXAMPLE, responsePath: ['input_token', 'address'] },
            { param: 'output_contract', value: TVM_CONTRACT_WTRX_EXAMPLE, responsePath: ['output_token', 'address'] },
            { param: 'protocol', value: 'uniswap_v1', responsePath: ['protocol'] },
        ],
    },
    {
        chain: 'SVM',
        path: '/v1/svm/transfers',
        requires: () => hasSvmTransfers,
        network: () => svmNetwork,
        filters: [
            { param: 'signature', value: SVM_TRANSACTION_TRANSFER_EXAMPLE, responsePath: ['signature'] },
            { param: 'source', value: SVM_TOKEN_ACCOUNT_PUMP_EXAMPLE, responsePath: ['source'] },
            { param: 'destination', value: SVM_ADDRESS_DESTINATION_EXAMPLE, responsePath: ['destination'] },
            { param: 'authority', value: SVM_AUTHORITY_USER_EXAMPLE, responsePath: ['authority'] },
            { param: 'mint', value: SVM_MINT_WSOL_EXAMPLE, responsePath: ['mint'] },
            {
                param: 'program_id',
                value: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
                responsePath: ['program_id'],
            },
        ],
    },
    {
        chain: 'SVM',
        path: '/v1/svm/swaps',
        requires: () => hasSvmDex,
        network: () => svmNetwork,
        filters: [
            { param: 'signature', value: SVM_TRANSACTION_SWAP_EXAMPLE, responsePath: ['signature'] },
            { param: 'amm', value: SVM_AMM_RAYDIUM_V4_EXAMPLE, responsePath: ['amm'] },
            { param: 'amm_pool', value: SVM_AMM_POOL_PUMP_EXAMPLE, responsePath: ['amm_pool'] },
            { param: 'user', value: SVM_ADDRESS_USER_EXAMPLE, responsePath: ['user'] },
            { param: 'input_mint', value: SVM_MINT_WSOL_EXAMPLE, responsePath: ['input_mint'] },
            { param: 'output_mint', value: SVM_MINT_USDC_EXAMPLE, responsePath: ['output_mint'] },
            {
                param: 'program_id',
                value: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
                responsePath: ['program_id'],
            },
        ],
    },
] as const;

async function fetchRoute(path: string) {
    const response = await app.request(path, { headers: { 'X-Plan': 'free' } });
    const body = await response.json();
    return { response, body };
}

async function fetchExactMainnetRow(
    path: string,
    params: string
): Promise<{ block_num: number; timestamp: number; transaction_id: string }> {
    const { response, body } = await fetchRoute(`${path}?network=${MAINNET_NETWORK}&${params}&limit=1`);

    expect(response.status).toBe(200);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(1);

    return body.data[0] as { block_num: number; timestamp: number; transaction_id: string };
}

function getValueAtPath(value: unknown, path: readonly string[]) {
    return path.reduce<unknown>((current, segment) => {
        if (current === null || current === undefined || typeof current !== 'object') return undefined;
        return (current as Record<string, unknown>)[segment];
    }, value);
}

describe.skipIf(!DB_TESTS)('SQL queries', () => {
    beforeAll(async () => {
        // Lazy-load config and routes to avoid circular dependency issues
        const { config } = await import('../config.js');
        const { hasDatabase } = await import('../supported-routes.js');

        // Bypass plan limits for DB integration tests (config.plans may be mutated by other test files)
        (config as any).plans = null;

        app = new Hono();
        const routes = await import('./index.js');
        app.route('/', routes.default);

        // Check which DB categories are connected for each network
        hasEvmBalances = hasDatabase(config, config.defaultEvmNetwork, 'balances');
        hasEvmTransfers = hasDatabase(config, config.defaultEvmNetwork, 'transfers');
        hasEvmDex = hasDatabase(config, config.defaultEvmNetwork, 'dex');
        hasEvmNft = hasDatabase(config, config.defaultEvmNetwork, 'nft');
        hasEvmContracts = hasDatabase(config, config.defaultEvmNetwork, 'contracts');
        hasSvmBalances = hasDatabase(config, config.defaultSvmNetwork, 'balances');
        hasSvmTransfers = hasDatabase(config, config.defaultSvmNetwork, 'transfers');
        hasSvmDex = hasDatabase(config, config.defaultSvmNetwork, 'dex');
        hasTvmTransfers = hasDatabase(config, config.defaultTvmNetwork, 'transfers');
        hasTvmDex = hasDatabase(config, config.defaultTvmNetwork, 'dex');

        evmNetwork = config.defaultEvmNetwork;
        svmNetwork = config.defaultSvmNetwork;
        tvmNetwork = config.defaultTvmNetwork;
    });

    // --- Monitoring ---
    it('GET /v1/health', async () => {
        const { response, body } = await fetchRoute('/v1/health');
        expect(response.status).toBe(200);
        expect(body).toHaveProperty('status');
        expect(body.status).toBe('OK');
    });

    it('GET /v1/version', async () => {
        const { response, body } = await fetchRoute('/v1/version');
        expect(response.status).toBe(200);
        expect(body).toHaveProperty('version');
        expect(body).toHaveProperty('date');
        expect(body).toHaveProperty('commit');
        expect(typeof body.version).toBe('string');
    });

    it('GET /v1/networks', async () => {
        const { response, body } = await fetchRoute('/v1/networks');
        expect(response.status).toBe(200);
        expect(body).toHaveProperty('networks');
        expect(body.networks).toBeArray();
        expect(body.networks.length).toBeGreaterThan(0);
        // Check indexed_to data embedded in each network
        for (const network of body.networks) {
            expect(network).toHaveProperty('id');
            expect(network).toHaveProperty('indexed_to');
            expect(network.indexed_to).toBeArray();
            for (const entry of network.indexed_to) {
                expect(entry).toHaveProperty('category');
                expect(entry).toHaveProperty('version');
                expect(entry).toHaveProperty('block_num');
                expect(entry).toHaveProperty('datetime');
                expect(entry).toHaveProperty('timestamp');
            }
        }
    });

    // --- EVM Tokens ---
    it('GET /v1/evm/tokens', async () => {
        if (!hasEvmBalances || !hasEvmTransfers) return;
        const { response, body } = await fetchRoute(
            `/v1/evm/tokens?network=${evmNetwork}&contract=${EVM_CONTRACT_USDT_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    it('GET /v1/evm/tokens/metadata', async () => {
        if (!hasEvmBalances) return;
        const { response, body } = await fetchRoute(
            `/v1/evm/tokens/metadata?network=${evmNetwork}&contract=${EVM_CONTRACT_USDT_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
        expect(body.data[0]).toHaveProperty('name');
        expect(body.data[0]).toHaveProperty('symbol');
        expect(body.data[0]).toHaveProperty('decimals');
        expect(body.data[0]).not.toHaveProperty('circulating_supply');
        expect(body.data[0]).not.toHaveProperty('holders');
    });

    it('GET /v1/evm/tokens/native', async () => {
        if (!hasEvmBalances) return;
        const { response, body } = await fetchRoute(`/v1/evm/tokens/native?network=${evmNetwork}`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- SVM Tokens ---
    it('GET /v1/svm/tokens', async () => {
        if (!hasSvmBalances) return;
        const { response, body } = await fetchRoute(
            `/v1/svm/tokens?network=${svmNetwork}&mint=${SVM_MINT_WSOL_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    it('GET /v1/svm/tokens/metadata', async () => {
        if (!hasSvmBalances) return;
        const { response, body } = await fetchRoute(
            `/v1/svm/tokens/metadata?network=${svmNetwork}&mint=${SVM_MINT_WSOL_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
        expect(body.data[0]).toHaveProperty('name');
        expect(body.data[0]).toHaveProperty('symbol');
        expect(body.data[0]).toHaveProperty('decimals');
        expect(body.data[0]).not.toHaveProperty('circulating_supply');
        expect(body.data[0]).not.toHaveProperty('holders');
    });

    // --- TVM Tokens ---
    it('GET /v1/tvm/tokens', async () => {
        if (!hasTvmTransfers) return;
        const { response, body } = await fetchRoute(
            `/v1/tvm/tokens?network=${tvmNetwork}&contract=${TVM_CONTRACT_USDT_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    it('GET /v1/tvm/tokens/metadata', async () => {
        if (!hasTvmTransfers) return;
        const { response, body } = await fetchRoute(
            `/v1/tvm/tokens/metadata?network=${tvmNetwork}&contract=${TVM_CONTRACT_USDT_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
        expect(body.data[0]).toHaveProperty('name');
        expect(body.data[0]).toHaveProperty('symbol');
        expect(body.data[0]).toHaveProperty('decimals');
        expect(body.data[0]).not.toHaveProperty('total_transfers');
    });

    it('GET /v1/tvm/tokens/native', async () => {
        if (!hasTvmTransfers) return;
        const { response, body } = await fetchRoute(`/v1/tvm/tokens/native?network=${tvmNetwork}`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- EVM Balances ---
    it('GET /v1/evm/balances', async () => {
        if (!hasEvmBalances) return;
        const { response, body } = await fetchRoute(
            `/v1/evm/balances?network=${evmNetwork}&address=${EVM_ADDRESS_VITALIK_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    it('GET /v1/evm/balances/native', async () => {
        if (!hasEvmBalances) return;
        const { response, body } = await fetchRoute(
            `/v1/evm/balances/native?network=${evmNetwork}&address=${EVM_ADDRESS_VITALIK_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    it('GET /v1/evm/balances/historical', async () => {
        if (!hasEvmBalances) return;
        const { response, body } = await fetchRoute(
            `/v1/evm/balances/historical?network=${evmNetwork}&address=${EVM_ADDRESS_VITALIK_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    it('GET /v1/evm/balances/historical/native', async () => {
        if (!hasEvmBalances) return;
        const { response, body } = await fetchRoute(
            `/v1/evm/balances/historical/native?network=${evmNetwork}&address=${EVM_ADDRESS_VITALIK_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- SVM Balances ---
    it('GET /v1/svm/balances', async () => {
        if (!hasSvmBalances) return;
        const { response, body } = await fetchRoute(
            `/v1/svm/balances?network=${svmNetwork}&owner=${SVM_OWNER_USER_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    it('GET /v1/svm/balances/native', async () => {
        if (!hasSvmBalances) return;
        const { response, body } = await fetchRoute(
            `/v1/svm/balances/native?network=${svmNetwork}&address=${SVM_ADDRESS_OWNER_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- EVM Transfers ---
    it('GET /v1/evm/transfers', async () => {
        if (!hasEvmTransfers) return;
        const { response, body } = await fetchRoute(`/v1/evm/transfers?network=${evmNetwork}`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    it('GET /v1/evm/transfers/native', async () => {
        if (!hasEvmTransfers) return;
        const { response, body } = await fetchRoute(`/v1/evm/transfers/native?network=${evmNetwork}`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- SVM Transfers ---
    it('GET /v1/svm/transfers', async () => {
        if (!hasSvmTransfers) return;
        const { response, body } = await fetchRoute(`/v1/svm/transfers?network=${svmNetwork}`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- TVM Transfers ---
    it('GET /v1/tvm/transfers', async () => {
        if (!hasTvmTransfers) return;
        const { response, body } = await fetchRoute(`/v1/tvm/transfers?network=${tvmNetwork}`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    it('GET /v1/tvm/transfers/native', async () => {
        if (!hasTvmTransfers) return;
        const { response, body } = await fetchRoute(`/v1/tvm/transfers/native?network=${tvmNetwork}`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- EVM Holders ---
    it('GET /v1/evm/holders', async () => {
        if (!hasEvmBalances) return;
        const { response, body } = await fetchRoute(
            `/v1/evm/holders?network=${evmNetwork}&contract=${EVM_CONTRACT_USDT_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    it('GET /v1/evm/holders/native', async () => {
        if (!hasEvmBalances) return;
        const { response, body } = await fetchRoute(`/v1/evm/holders/native?network=${evmNetwork}`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- SVM Holders ---
    it('GET /v1/svm/holders', async () => {
        if (!hasSvmBalances) return;
        const { response, body } = await fetchRoute(
            `/v1/svm/holders?network=${svmNetwork}&mint=${SVM_MINT_WSOL_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
        // Verify the fix: each holder must expose both wallet owner and ATA
        for (const item of body.data) {
            expect(item).toHaveProperty('owner');
            expect(item).toHaveProperty('token_account');
        }
    });

    it('GET /v1/svm/holders owner is wallet not token account', async () => {
        if (!hasSvmBalances) return;
        // Use USDC mint — a well-known SPL token with real ATAs — so owner != token_account
        const { response, body } = await fetchRoute(
            `/v1/svm/holders?network=${svmNetwork}&mint=${SVM_MINT_USDC_EXAMPLE}&limit=5`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
        for (const item of body.data) {
            expect(item).toHaveProperty('owner');
            expect(item).toHaveProperty('token_account');
            // For a regular SPL token, the wallet owner differs from the token account (ATA)
            expect(item.owner).not.toBe(item.token_account);
        }
    });

    // --- EVM Swaps ---
    it('GET /v1/evm/swaps', async () => {
        if (!hasEvmDex) return;
        const { response, body } = await fetchRoute(`/v1/evm/swaps?network=${evmNetwork}`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- SVM Swaps ---
    it('GET /v1/svm/swaps', async () => {
        if (!hasSvmDex) return;
        const { response, body } = await fetchRoute(`/v1/svm/swaps?network=${svmNetwork}`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- TVM Swaps ---
    it('GET /v1/tvm/swaps', async () => {
        if (!hasTvmDex) return;
        const { response, body } = await fetchRoute(`/v1/tvm/swaps?network=${tvmNetwork}`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- EVM DEXes ---
    it('GET /v1/evm/dexes', async () => {
        if (!hasEvmDex) return;
        const { response, body } = await fetchRoute(`/v1/evm/dexes?network=${evmNetwork}`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- SVM DEXes ---
    it('GET /v1/svm/dexes', async () => {
        if (!hasSvmDex) return;
        const { response, body } = await fetchRoute(`/v1/svm/dexes?network=${svmNetwork}`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- TVM DEXes ---
    it('GET /v1/tvm/dexes', async () => {
        if (!hasTvmDex) return;
        const { response, body } = await fetchRoute(`/v1/tvm/dexes?network=${tvmNetwork}`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- EVM Pools ---
    it('GET /v1/evm/pools', async () => {
        if (!hasEvmDex) return;
        const { response, body } = await fetchRoute(`/v1/evm/pools?network=${evmNetwork}`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- SVM Pools ---
    it('GET /v1/svm/pools', async () => {
        if (!hasSvmDex) return;
        const { response, body } = await fetchRoute(`/v1/svm/pools?network=${svmNetwork}`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- TVM Pools ---
    it('GET /v1/tvm/pools', async () => {
        if (!hasTvmDex) return;
        const { response, body } = await fetchRoute(`/v1/tvm/pools?network=${tvmNetwork}`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- EVM OHLCV ---
    it('GET /v1/evm/pools/ohlc', async () => {
        if (!hasEvmDex) return;
        const { response, body } = await fetchRoute(
            `/v1/evm/pools/ohlc?network=${evmNetwork}&pool=${EVM_POOL_USDC_WETH_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- SVM OHLCV ---
    it('GET /v1/svm/pools/ohlc', async () => {
        if (!hasSvmDex || !hasSvmBalances) return;
        const { response, body } = await fetchRoute(
            `/v1/svm/pools/ohlc?network=${svmNetwork}&amm_pool=${SVM_AMM_POOL_PUMP_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- TVM OHLCV ---
    it('GET /v1/tvm/pools/ohlc', async () => {
        if (!hasTvmDex) return;
        const { response, body } = await fetchRoute(
            `/v1/tvm/pools/ohlc?network=${tvmNetwork}&pool=${TVM_POOL_USDT_WTRX_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- SVM Owner ---
    it('GET /v1/svm/owner', async () => {
        if (!hasSvmBalances) return;
        const { response, body } = await fetchRoute(
            `/v1/svm/owner?network=${svmNetwork}&account=${SVM_TOKEN_ACCOUNT_PUMP_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- EVM NFT ---
    it('GET /v1/evm/nft/collections', async () => {
        if (!hasEvmContracts || !hasEvmNft) return;
        const { response, body } = await fetchRoute(
            `/v1/evm/nft/collections?network=${evmNetwork}&contract=${EVM_CONTRACT_PUDGY_PENGUINS_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    it('GET /v1/evm/nft/holders', async () => {
        if (!hasEvmNft) return;
        const { response, body } = await fetchRoute(
            `/v1/evm/nft/holders?network=${evmNetwork}&contract=${EVM_CONTRACT_PUDGY_PENGUINS_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    it('GET /v1/evm/nft/items', async () => {
        if (!hasEvmNft) return;
        const { response, body } = await fetchRoute(
            `/v1/evm/nft/items?network=${evmNetwork}&contract=${EVM_CONTRACT_PUDGY_PENGUINS_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    it('GET /v1/evm/nft/ownerships', async () => {
        if (!hasEvmNft) return;
        const { response, body } = await fetchRoute(
            `/v1/evm/nft/ownerships?network=${evmNetwork}&address=${EVM_ADDRESS_VITALIK_EXAMPLE}`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    it('GET /v1/evm/nft/sales', async () => {
        if (!hasEvmNft) return;
        const { response, body } = await fetchRoute(`/v1/evm/nft/sales?network=${evmNetwork}`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    it('GET /v1/evm/nft/transfers', async () => {
        if (!hasEvmNft) return;
        const { response, body } = await fetchRoute(`/v1/evm/nft/transfers?network=${evmNetwork}`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
    });

    // --- EVM Mainnet single-filter/default-bound coverage ---
    for (const routeCase of MAINNET_ROUTE_CASES) {
        for (const boundary of MAINNET_BOUNDARIES) {
            it(`GET ${routeCase.path} exact start_time=end_time on mainnet at ${boundary.label}`, async () => {
                if ((routeCase.db === 'transfers' && !hasEvmTransfers) || (routeCase.db === 'dex' && !hasEvmDex))
                    return;

                const row = await fetchExactMainnetRow(
                    routeCase.path,
                    `start_time=${boundary.timestamp}&end_time=${boundary.timestamp}`
                );

                expect(row.timestamp).toBe(boundary.timestamp);
            });

            it(`GET ${routeCase.path} exact start_block=end_block on mainnet at ${boundary.label}`, async () => {
                if ((routeCase.db === 'transfers' && !hasEvmTransfers) || (routeCase.db === 'dex' && !hasEvmDex))
                    return;

                const row = await fetchExactMainnetRow(
                    routeCase.path,
                    `start_block=${boundary.block}&end_block=${boundary.block}`
                );

                expect(row.block_num).toBe(boundary.block);
            });

            it(`GET ${routeCase.path} single transaction_id filter uses default bounds on mainnet at ${boundary.label}`, async () => {
                if ((routeCase.db === 'transfers' && !hasEvmTransfers) || (routeCase.db === 'dex' && !hasEvmDex))
                    return;

                const fixture = await fetchExactMainnetRow(
                    routeCase.path,
                    `start_block=${boundary.block}&end_block=${boundary.block}`
                );

                const { response, body } = await fetchRoute(
                    `${routeCase.path}?network=${MAINNET_NETWORK}&transaction_id=${fixture.transaction_id}&limit=1`
                );

                expect(response.status).toBe(200);
                expect(body.data).toBeArray();
                expect(body.data.length).toBe(1);
                expect(body.data[0].transaction_id).toBe(fixture.transaction_id);
            });
        }
    }

    // --- Single-filter coverage across EVM / TVM / SVM ---
    for (const routeCase of SINGLE_FILTER_ROUTE_CASES) {
        for (const filter of routeCase.filters) {
            it(`GET ${routeCase.path} single ${filter.param} filter on ${routeCase.chain}`, async () => {
                if (!routeCase.requires()) return;

                const { response, body } = await fetchRoute(
                    `${routeCase.path}?network=${routeCase.network()}&${filter.param}=${encodeURIComponent(filter.value)}&limit=5`
                );

                expect(response.status).toBe(200);
                expect(body.data).toBeArray();
                expect(body.data.length).toBeGreaterThan(0);

                for (const row of body.data as unknown[]) {
                    expect(getValueAtPath(row, filter.responsePath)).toBe(filter.value);
                }
            });
        }
    }

    // --- Polymarket ---
    const POLYMARKET_CONDITION_ID = '0x39e227f0e4a6c0a7b282d77ae0e7d247d0cc4b8e69a348e853442bbd4db10f6a';
    const POLYMARKET_TOKEN_ID = '48262548906086150698299934962091284390063927164151224719187427455086357699251';
    const POLYMARKET_SLUG = 'bitcoin-above-86000-on-april-4';
    const POLYMARKET_USER = '0x38e598961dd0456a7fb2e758bd433d3e59fb8a4a';

    let hasPolymarket: boolean;

    it('detect polymarket config', async () => {
        const { config } = await import('../config.js');
        hasPolymarket = !!config.polymarketDatabases?.polymarket;
    });

    it('GET /v1/polymarket/platform', async () => {
        if (!hasPolymarket) return;
        const { response, body } = await fetchRoute('/v1/polymarket/platform?interval=1d&limit=1');
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
        expect(body.data[0]).toHaveProperty('timestamp');
        expect(body.data[0]).toHaveProperty('volume');
        expect(body.data[0]).toHaveProperty('net_open_interest');
        expect(body.data[0]).toHaveProperty('total_fees');
    });

    it('GET /v1/polymarket/markets (by slug)', async () => {
        if (!hasPolymarket) return;
        const { response, body } = await fetchRoute(`/v1/polymarket/markets?market_slug=${POLYMARKET_SLUG}&limit=1`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBe(1);
        expect(body.data[0]).toHaveProperty('condition_id');
        expect(body.data[0]).toHaveProperty('outcomes');
        expect(body.data[0].outcomes).toBeArray();
        expect(body.data[0].outcomes.length).toBe(2);
        expect(body.data[0].outcomes[0]).toHaveProperty('label');
        expect(body.data[0].outcomes[0]).toHaveProperty('token_id');
    });

    it('GET /v1/polymarket/markets (discovery)', async () => {
        if (!hasPolymarket) return;
        const { response, body } = await fetchRoute('/v1/polymarket/markets?limit=5');
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBe(5);
    });

    it('GET /v1/polymarket/markets/ohlc', async () => {
        if (!hasPolymarket) return;
        const { response, body } = await fetchRoute(
            `/v1/polymarket/markets/ohlc?token_id=${POLYMARKET_TOKEN_ID}&interval=1d&limit=1`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
        expect(body.data[0]).toHaveProperty('open');
        expect(body.data[0]).toHaveProperty('close');
        expect(body.data[0]).toHaveProperty('market');
        expect(body.data[0].market).toHaveProperty('condition_id');
        expect(body.data[0].market).toHaveProperty('token_id');
        expect(body.data[0].market).toHaveProperty('outcome_label');
    });

    it('GET /v1/polymarket/markets/oi (by condition_id)', async () => {
        if (!hasPolymarket) return;
        const { response, body } = await fetchRoute(
            `/v1/polymarket/markets/oi?condition_id=${POLYMARKET_CONDITION_ID}&interval=1d&limit=1`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
        expect(body.data[0]).toHaveProperty('net_open_interest');
        expect(body.data[0].market.token_id).toBeNull();
        expect(body.data[0].market.outcome_label).toBeNull();
    });

    it('GET /v1/polymarket/markets/oi (by slug)', async () => {
        if (!hasPolymarket) return;
        const { response, body } = await fetchRoute(
            `/v1/polymarket/markets/oi?market_slug=${POLYMARKET_SLUG}&interval=1d&limit=1`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
        expect(body.data[0].market.market_slug).toBe(POLYMARKET_SLUG);
    });

    it('GET /v1/polymarket/markets/activity (by user)', async () => {
        if (!hasPolymarket) return;
        const { response, body } = await fetchRoute(`/v1/polymarket/markets/activity?user=${POLYMARKET_USER}&limit=3`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
        expect(body.data[0]).toHaveProperty('event_type');
        expect(body.data[0]).toHaveProperty('tx_hash');
        expect(body.data[0]).toHaveProperty('market');
    });

    it('GET /v1/polymarket/markets/activity (by token_id)', async () => {
        if (!hasPolymarket) return;
        const { response, body } = await fetchRoute(
            `/v1/polymarket/markets/activity?token_id=${POLYMARKET_TOKEN_ID}&limit=3`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
        for (const row of body.data) {
            expect(row.event_type).toBe('trade');
            expect(row.market.token_id).not.toBeNull();
        }
    });

    it('GET /v1/polymarket/markets/activity requires filter', async () => {
        if (!hasPolymarket) return;
        const { response } = await fetchRoute('/v1/polymarket/markets/activity?limit=1');
        expect(response.status).toBe(400);
    });

    it('GET /v1/polymarket/markets/positions', async () => {
        if (!hasPolymarket) return;
        const { response, body } = await fetchRoute(
            `/v1/polymarket/markets/positions?token_id=${POLYMARKET_TOKEN_ID}&limit=3`
        );
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
        expect(body.data[0]).toHaveProperty('user');
        expect(body.data[0]).toHaveProperty('position_value');
        expect(typeof body.data[0].active).toBe('boolean');
        expect(body.data[0].market.token_id).toBe(POLYMARKET_TOKEN_ID);
        expect(typeof body.data[0].market.closed).toBe('boolean');
    });

    it('GET /v1/polymarket/users (discovery)', async () => {
        if (!hasPolymarket) return;
        const { response, body } = await fetchRoute('/v1/polymarket/users?limit=5');
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBe(5);
        expect(body.data[0]).toHaveProperty('user');
        expect(body.data[0]).toHaveProperty('total_volume');
        expect(body.data[0]).toHaveProperty('realized_pnl');
        expect(body.data[0]).toHaveProperty('transactions');
        expect(body.data[0]).toHaveProperty('first_trade');
        expect(body.data[0]).toHaveProperty('last_trade');
    });

    it('GET /v1/polymarket/users (lookup)', async () => {
        if (!hasPolymarket) return;
        const { response, body } = await fetchRoute(`/v1/polymarket/users?user=${POLYMARKET_USER}&limit=1`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBe(1);
        expect(body.data[0].user).toBe(POLYMARKET_USER);
        expect(body.data[0].total_volume).toBeGreaterThan(0);
    });

    it('GET /v1/polymarket/users/positions', async () => {
        if (!hasPolymarket) return;
        const { response, body } = await fetchRoute(`/v1/polymarket/users/positions?user=${POLYMARKET_USER}&limit=3`);
        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);
        expect(body.data[0]).toHaveProperty('realized_pnl');
        expect(body.data[0]).toHaveProperty('market');
        expect(body.data[0].market).toHaveProperty('condition_id');
        expect(body.data[0].market).toHaveProperty('outcome_label');
        expect(typeof body.data[0].market.closed).toBe('boolean');
    });

    it('GET /v1/polymarket/markets/oi requires identifier', async () => {
        if (!hasPolymarket) return;
        const { response } = await fetchRoute('/v1/polymarket/markets/oi?interval=1d&limit=1');
        expect(response.status).toBe(400);
    });
});
