import { beforeAll, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import {
    EVM_CONTRACT_USDC_EXAMPLE,
    EVM_CONTRACT_WETH_EXAMPLE,
    EVM_TRANSACTION_SWAP_EXAMPLE,
} from '../../types/examples.js';

const DB_TESTS = !!process.env.DB_TESTS;

let app: Hono;
let evmNetwork: string;
let hasEvmDex: boolean;

async function fetchRoute(path: string) {
    const response = await app.request(path);
    const body = await response.json();
    return { response, body };
}

describe.skipIf(!DB_TESTS)('EVM swaps Uniswap V3 regression checks', () => {
    beforeAll(async () => {
        const { config } = await import('../../config.js');
        const { hasDatabase } = await import('../../supported-routes.js');
        const { default: evmSwapsRoute } = await import('./evm.js');

        app = new Hono();
        app.route('/v1/evm/swaps', evmSwapsRoute);

        evmNetwork = config.defaultEvmNetwork;
        hasEvmDex = hasDatabase(config, evmNetwork, 'dex');
    });

    it('returns the known Uniswap V3 fixture when filtering by transaction_id', async () => {
        if (!hasEvmDex) return;

        const { response, body } = await fetchRoute(
            `/v1/evm/swaps?network=${evmNetwork}&transaction_id=${EVM_TRANSACTION_SWAP_EXAMPLE}&limit=1`
        );

        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBe(1);

        const row = body.data[0] as {
            protocol: string;
            transaction_id: string;
            input_token: { address: string };
            output_token: { address: string };
        };

        expect(row.transaction_id).toBe(EVM_TRANSACTION_SWAP_EXAMPLE);
        expect(row.protocol).toBe('uniswap_v3');
    });

    it('returns only Uniswap V3 swaps when filtering by protocol=uniswap_v3', async () => {
        if (!hasEvmDex) return;

        const { response, body } = await fetchRoute(`/v1/evm/swaps?network=${evmNetwork}&protocol=uniswap_v3&limit=5`);

        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);

        for (const row of body.data as Array<{ protocol: string }>) {
            expect(row.protocol).toBe('uniswap_v3');
        }
    });

    it('keeps the token orientation hotfix for the known fixture tx when filtering by protocol=uniswap_v3', async () => {
        if (!hasEvmDex) return;

        const { response, body } = await fetchRoute(
            `/v1/evm/swaps?network=${evmNetwork}&protocol=uniswap_v3&transaction_id=${EVM_TRANSACTION_SWAP_EXAMPLE}&limit=1`
        );

        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBe(1);

        const row = body.data[0] as {
            protocol: string;
            transaction_id: string;
            input_token: { address: string };
            output_token: { address: string };
        };

        expect(row.protocol).toBe('uniswap_v3');
        expect(row.transaction_id).toBe(EVM_TRANSACTION_SWAP_EXAMPLE);
        // inverse orientation hotfix checks
        expect(row.input_token.address).toBe(EVM_CONTRACT_USDC_EXAMPLE);
        expect(row.output_token.address).toBe(EVM_CONTRACT_WETH_EXAMPLE);

        // // fixed
        // expect(row.input_token.address).toBe(EVM_CONTRACT_WETH_EXAMPLE);
        // expect(row.output_token.address).toBe(EVM_CONTRACT_USDC_EXAMPLE);
    });

    it('returns only USDC input tokens when filtering Uniswap V3 swaps by input_contract=USDC', async () => {
        if (!hasEvmDex) return;

        const { response, body } = await fetchRoute(
            `/v1/evm/swaps?network=${evmNetwork}&protocol=uniswap_v3&input_contract=${EVM_CONTRACT_USDC_EXAMPLE}&limit=5`
        );

        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);

        for (const row of body.data as Array<{ protocol: string; input_token: { address: string } }>) {
            expect(row.protocol).toBe('uniswap_v3');
            expect(row.input_token.address).toBe(EVM_CONTRACT_USDC_EXAMPLE);
        }
    });

    it('returns only WETH output tokens when filtering Uniswap V3 swaps by output_contract=WETH', async () => {
        if (!hasEvmDex) return;

        const { response, body } = await fetchRoute(
            `/v1/evm/swaps?network=${evmNetwork}&protocol=uniswap_v3&output_contract=${EVM_CONTRACT_WETH_EXAMPLE}&limit=5`
        );

        expect(response.status).toBe(200);
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThan(0);

        for (const row of body.data as Array<{ protocol: string; output_token: { address: string } }>) {
            expect(row.protocol).toBe('uniswap_v3');
            expect(row.output_token.address).toBe(EVM_CONTRACT_WETH_EXAMPLE);
        }
    });
});
