import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const evm = {
    type: 'evm',
    cluster: 'test',
    balances: 'balances',
    transfers: 'transfers',
    dexes: 'dexes',
    nfts: 'nfts',
    contracts: 'contracts',
};
const svm = {
    type: 'svm',
    cluster: 'test',
    balances: 'balances',
    transfers: 'transfers',
    dexes: 'dexes',
    accounts: 'accounts',
    metadata: 'metadata',
};

describe('Configured route availability', () => {
    const cases = [
        { name: 'both families', networks: { mainnet: evm, solana: svm }, evm: 20, svm: 13 },
        { name: 'EVM only', networks: { mainnet: evm }, evm: 20, svm: 0 },
        {
            name: 'default EVM network after another network',
            networks: { 'arbitrum-one': evm, mainnet: evm },
            evm: 20,
            svm: 0,
        },
        { name: 'EVM without the default network', networks: { 'arbitrum-one': evm }, evm: 20, svm: 0 },
        { name: 'SVM only', networks: { solana: svm }, evm: 0, svm: 13 },
        { name: 'no families', networks: {}, evm: 0, svm: 0 },
        {
            name: 'SVM accounts only',
            networks: { solana: { type: 'svm', cluster: 'test', accounts: 'accounts' } },
            evm: 0,
            svm: 1,
        },
        {
            name: 'partial databases',
            networks: { mainnet: { type: 'evm', cluster: 'test', transfers: 'transfers' } },
            evm: 2,
            svm: 0,
        },
    ];

    for (const fixture of cases) {
        it(`keeps routes, OpenAPI and x402 aligned with ${fixture.name}`, () => {
            const dir = mkdtempSync(join(tmpdir(), 'pinax-route-test-'));
            const configPath = join(dir, 'dbs.json');
            writeFileSync(
                configPath,
                JSON.stringify({
                    clusters: { test: { url: 'http://127.0.0.1:1' } },
                    networks: fixture.networks,
                })
            );
            try {
                // Separate processes avoid global config and OpenAPI caches leaking between fixtures.
                const child = Bun.spawnSync(
                    [
                        process.execPath,
                        '--eval',
                        `
                    import assert from 'node:assert/strict';
                    import { mock } from 'bun:test';
                    mock.module('@pinax/graph-networks-registry', () => ({
                        NetworksRegistry: { fromLatestVersion: async () => ({ getNetworkByGraphId: id => ({id, fullName: id, shortName: id, caip2Id: id, networkType: 'mainnet', icon: {web3Icons: {name: id}}, aliases: []}) }) },
                    }));
                    const { default: app } = await import('./index.ts');
                    const { evmNetworkIdSchema, svmNetworkIdSchema } = await import('./src/types/zod.ts');
                    const request = path => app.fetch(new Request('http://localhost' + path));
                    const specResponse = await request('/openapi');
                    assert.equal(specResponse.status, 200);
                    const spec = await specResponse.json();
                    const tokenPaths = Object.keys(spec.paths).filter(p => /^\\/v1\\/(evm|svm)\\//.test(p)).sort();
                    assert.equal(tokenPaths.filter(p => p.startsWith('/v1/evm/')).length, ${fixture.evm});
                    assert.equal(tokenPaths.filter(p => p.startsWith('/v1/svm/')).length, ${fixture.svm});
                    assert.equal(JSON.stringify(spec).includes('/v1/tvm/'), false);
                    const discovery = await (await request('/.well-known/x402')).json();
                    const dataset = discovery.datasets.find(d => d.name === 'Token API');
                    assert.deepEqual((dataset?.routePatterns ?? []).sort(), tokenPaths);
                    for (const route of discovery.freeRoutes.filter(r => /^\\/v1\\/(evm|svm)\\//.test(r.path))) {
                        assert(tokenPaths.includes(route.path));
                    }
                    for (const path of tokenPaths) {
                        // Invalid networks exercise the registered handler without contacting ClickHouse.
                        assert.equal((await request(path + '?network=unconfigured')).status, 400);
                    }
                    const retired = await request('/v1/tvm/transfers?network=tron');
                    assert.equal(retired.status, 404);
                    assert.equal((await retired.json()).code, 'route_not_found');
                    assert.equal(evmNetworkIdSchema.safeParse('mainnet').success, ${Object.hasOwn(fixture.networks, 'mainnet')});
                    assert.equal(svmNetworkIdSchema.safeParse('solana').success, ${fixture.svm > 0});
                    const expectedEvmExample = ${JSON.stringify(Object.hasOwn(fixture.networks, 'mainnet') ? 'mainnet' : Object.hasOwn(fixture.networks, 'arbitrum-one') ? 'arbitrum-one' : null)};
                    assert.equal(evmNetworkIdSchema.meta()?.example, expectedEvmExample ?? undefined);
                    assert.equal(svmNetworkIdSchema.meta()?.example, ${fixture.svm > 0 ? "'solana'" : 'undefined'});
                    for (const family of ['evm', 'svm']) {
                        if (!tokenPaths.some(p => p.startsWith('/v1/' + family + '/'))) {
                            assert.equal((await request('/v1/' + family + '/transfers')).status, 404);
                        }
                    }
                `,
                    ],
                    {
                        cwd: join(import.meta.dir, '../..'),
                        env: {
                            ...process.env,
                            DBS_CONFIG_PATH: configPath,
                            SKIP_NETWORKS_VALIDATION: Object.keys(fixture.networks).length ? 'true' : 'false',
                        },
                        stdout: 'pipe',
                        stderr: 'pipe',
                        timeout: 20_000,
                    }
                );
                expect(child.stderr.toString()).toBe('');
                expect(child.exitCode).toBe(0);
            } finally {
                rmSync(dir, { recursive: true, force: true });
            }
        }, 25_000);
    }
});
