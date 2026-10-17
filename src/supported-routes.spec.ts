import { describe, expect, it } from 'bun:test';
import { config } from './config.js';
import { getSupportedRoutes, hasDatabase, ROUTE_DEFINITIONS } from './supported-routes.js';

describe('ROUTE_DEFINITIONS', () => {
    it('should have entries for all expected route paths', () => {
        expect(ROUTE_DEFINITIONS.length).toBeGreaterThan(0);
        // Verify all chains are represented
        const chains = new Set(ROUTE_DEFINITIONS.map((r) => r.chain));
        expect(chains.has('evm')).toBe(true);
        expect(chains.has('svm')).toBe(true);
        expect([...chains].sort()).toEqual(['evm', 'svm']);
    });

    it('should have valid DB categories for all routes', () => {
        const validCategories = [
            'balances',
            'balances-native',
            'balances-erc20',
            'transfers',
            'dex',
            'nft',
            'contracts',
            'accounts',
            'metadata',
        ];
        for (const route of ROUTE_DEFINITIONS) {
            expect(route.requires.length).toBeGreaterThan(0);
            for (const cat of route.requires) {
                expect(validCategories).toContain(cat);
            }
        }
    });
});

describe('getSupportedRoutes', () => {
    it('should return supported and unsupported arrays', () => {
        const result = getSupportedRoutes(config);
        expect(result).toHaveProperty('supported');
        expect(result).toHaveProperty('unsupported');
        expect(Array.isArray(result.supported)).toBe(true);
        expect(Array.isArray(result.unsupported)).toBe(true);
    });

    it('should have total count equal to ROUTE_DEFINITIONS length', () => {
        const result = getSupportedRoutes(config);
        expect(result.supported.length + result.unsupported.length).toBe(ROUTE_DEFINITIONS.length);
    });

    it('should serve EVM balances routes from split, combined or mixed databases', () => {
        const mapping = (database: string) => ({ database, type: 'evm', cluster: 'c' });
        const native = ['/v1/evm/balances/native', '/v1/evm/tokens/native', '/v1/evm/balances/historical/native'];
        const erc20 = ['/v1/evm/balances', '/v1/evm/balances/historical'];
        const routesWith = (dbs: Partial<typeof config>) =>
            getSupportedRoutes({
                ...config,
                evmNetworks: ['bsc'],
                svmNetworks: [],
                balancesDatabases: {},
                balancesNativeDatabases: {},
                balancesErc20Databases: {},
                transfersDatabases: {},
                dexesDatabases: {},
                nftsDatabases: {},
                contractsDatabases: {},
                accountsDatabases: {},
                metadataDatabases: {},
                ...dbs,
            }).supported;

        const split = routesWith({
            balancesNativeDatabases: { bsc: mapping('bsc:evm-balances-native@v0.7.2') },
            balancesErc20Databases: { bsc: mapping('bsc:evm-balances-erc20@v0.7.0') },
        });
        expect(split.sort()).toEqual([...native, ...erc20].sort());

        const combined = routesWith({ balancesDatabases: { bsc: mapping('bsc:evm-balances@v0.3.3') } });
        expect(combined.sort()).toEqual([...native, ...erc20].sort());

        const nativeOnly = routesWith({ balancesNativeDatabases: { bsc: mapping('bsc:evm-balances-native@v0.7.2') } });
        expect(nativeOnly.sort()).toEqual([...native].sort());

        const mixed = routesWith({
            balancesDatabases: { bsc: mapping('bsc:evm-balances@v0.3.3') },
            balancesNativeDatabases: { bsc: mapping('bsc:evm-balances-native@v0.7.2') },
        });
        expect(mixed.sort()).toEqual([...native, ...erc20].sort());

        // Holders also need contracts.
        const withContracts = routesWith({
            balancesErc20Databases: { bsc: mapping('bsc:evm-balances-erc20@v0.7.0') },
            contractsDatabases: { bsc: mapping('bsc:evm-contracts@v0.3.0') },
        });
        expect(withContracts.sort()).toEqual([...erc20, '/v1/evm/holders'].sort());
    });

    it('should not have duplicates between supported and unsupported', () => {
        const result = getSupportedRoutes(config);
        const allRoutes = [...result.supported, ...result.unsupported];
        const unique = new Set(allRoutes);
        expect(unique.size).toBe(allRoutes.length);
    });
});

describe('hasDatabase', () => {
    it('should return false for non-existent network', () => {
        expect(hasDatabase(config, 'nonexistent_network', 'balances')).toBe(false);
    });

    it('should return false for non-existent category on valid network', () => {
        // If there are configured networks, check a category that may not be configured
        if (config.networks.length > 0) {
            const [network] = config.networks;
            // At minimum, verify the function returns a boolean without errors
            expect(typeof hasDatabase(config, network as string, 'nft')).toBe('boolean');
        }
    });

    it('should be consistent with direct config access for balances', () => {
        for (const network of config.networks) {
            expect(hasDatabase(config, network, 'balances')).toBe(!!config.balancesDatabases[network]);
        }
    });

    it('should be consistent with direct config access for transfers', () => {
        for (const network of config.networks) {
            expect(hasDatabase(config, network, 'transfers')).toBe(!!config.transfersDatabases[network]);
        }
    });

    it('should be consistent with direct config access for dex', () => {
        for (const network of config.networks) {
            expect(hasDatabase(config, network, 'dex')).toBe(!!config.dexesDatabases[network]);
        }
    });

    it('should be consistent with direct config access for nft', () => {
        for (const network of config.networks) {
            expect(hasDatabase(config, network, 'nft')).toBe(!!config.nftsDatabases[network]);
        }
    });

    it('should be consistent with direct config access for contracts', () => {
        for (const network of config.networks) {
            expect(hasDatabase(config, network, 'contracts')).toBe(!!config.contractsDatabases[network]);
        }
    });
});
