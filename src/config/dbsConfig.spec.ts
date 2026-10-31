import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    DEFAULT_HOLDERS_NATIVE_CUTOFF,
    DEFAULT_HOLDERS_NATIVE_CUTOFFS,
    evmBalancesDatabase,
    holdersNativeCutoff,
    loadDbsConfig,
    nativeTokensToWei,
} from './dbsConfig.js';

function writeYaml(content: string): { path: string; cleanup: () => void } {
    const dir = mkdtempSync(join(tmpdir(), 'dbsconfig-test-'));
    const path = join(dir, 'dbs-config.yaml');
    writeFileSync(path, content);
    return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('loadDbsConfig', () => {
    it('should return empty config for undefined path', () => {
        const result = loadDbsConfig(undefined);
        expect(result.clusters).toEqual({});
        expect(result.balancesDatabases).toEqual({});
    });

    it('should return empty config for non-existent path', () => {
        const result = loadDbsConfig('/nonexistent/path.yaml');
        expect(result.clusters).toEqual({});
        expect(result.balancesDatabases).toEqual({});
    });

    it('should parse known database keys into expected properties', () => {
        const { path, cleanup } = writeYaml(`
clusters:
  a:
    url: http://localhost:8123
networks:
  mainnet:
    type: evm
    cluster: a
    balances: mainnet:evm-balances@v0.3.3
    transfers: mainnet:evm-transfers@v0.3.3
    nfts: mainnet:evm-nft-tokens@v0.6.2
    dexes: mainnet:evm-dex@v0.5.0
    contracts: mainnet:evm-contracts@v0.3.0
`);
        try {
            const result = loadDbsConfig(path);
            expect(result.balancesDatabases.mainnet?.database).toBe('mainnet:evm-balances@v0.3.3');
            expect(result.transfersDatabases.mainnet?.database).toBe('mainnet:evm-transfers@v0.3.3');
            expect(result.nftsDatabases.mainnet?.database).toBe('mainnet:evm-nft-tokens@v0.6.2');
            expect(result.dexesDatabases.mainnet?.database).toBe('mainnet:evm-dex@v0.5.0');
            expect(result.contractsDatabases.mainnet?.database).toBe('mainnet:evm-contracts@v0.3.0');
        } finally {
            cleanup();
        }
    });

    it('should parse polymarket database keys', () => {
        const { path, cleanup } = writeYaml(`
clusters:
  c:
    url: http://localhost:8123
networks:
  polymarket:
    type: polymarket
    cluster: c
    polymarket: polygon:evm-polymarket@v0.1.2
    scraper: polymarket
`);
        try {
            const result = loadDbsConfig(path);
            expect(result.polymarketDatabases.polymarket?.database).toBe('polygon:evm-polymarket@v0.1.2');
            expect(result.polymarketDatabases.polymarket?.type).toBe('polymarket');
            expect(result.scraperDatabases.polymarket?.database).toBe('polymarket');
            expect(result.scraperDatabases.polymarket?.cluster).toBe('c');
        } finally {
            cleanup();
        }
    });

    it('should preserve type and cluster in mappings', () => {
        const { path, cleanup } = writeYaml(`
clusters:
  a:
    url: http://localhost:8123
networks:
  solana:
    type: svm
    cluster: a
    balances: solana:svm-tokens@v0.2.8
`);
        try {
            const result = loadDbsConfig(path);
            expect(result.balancesDatabases.solana?.type).toBe('svm');
            expect(result.balancesDatabases.solana?.cluster).toBe('a');
        } finally {
            cleanup();
        }
    });

    it('should throw when cluster is not found', () => {
        const { path, cleanup } = writeYaml(`
clusters:
  a:
    url: http://localhost:8123
networks:
  mainnet:
    type: evm
    cluster: nonexistent
    balances: mainnet:evm-balances@v0.3.3
`);
        try {
            expect(() => loadDbsConfig(path)).toThrow('Cluster nonexistent not found');
        } finally {
            cleanup();
        }
    });

    it('should handle multiple networks on same cluster', () => {
        const { path, cleanup } = writeYaml(`
clusters:
  c:
    url: http://localhost:8123
networks:
  mainnet:
    type: evm
    cluster: c
    balances: mainnet:evm-balances@v0.3.3
  polygon:
    type: evm
    cluster: c
    balances: polygon:evm-balances@v0.3.3
`);
        try {
            const result = loadDbsConfig(path);
            expect(result.balancesDatabases.mainnet?.database).toBe('mainnet:evm-balances@v0.3.3');
            expect(result.balancesDatabases.polygon?.database).toBe('polygon:evm-balances@v0.3.3');
        } finally {
            cleanup();
        }
    });

    it('should initialize known maps as empty when no networks use them', () => {
        const { path, cleanup } = writeYaml(`
clusters:
  a:
    url: http://localhost:8123
networks:
  solana:
    type: svm
    cluster: a
    balances: solana:svm-tokens@v0.2.8
`);
        try {
            const result = loadDbsConfig(path);
            expect(result.transfersDatabases).toEqual({});
            expect(result.nftsDatabases).toEqual({});
            expect(result.polymarketDatabases).toEqual({});
        } finally {
            cleanup();
        }
    });

    it('should parse the split EVM balances keys', () => {
        const { path, cleanup } = writeYaml(`
clusters:
  c:
    url: http://localhost:8123
networks:
  bsc:
    type: evm
    cluster: c
    balances-native: bsc:evm-balances-native@v0.7.2
    balances-erc20: bsc:evm-balances-erc20@v0.7.0
`);
        try {
            const result = loadDbsConfig(path);
            expect(result.balancesNativeDatabases.bsc).toEqual({
                database: 'bsc:evm-balances-native@v0.7.2',
                type: 'evm',
                cluster: 'c',
            });
            expect(result.balancesErc20Databases.bsc).toEqual({
                database: 'bsc:evm-balances-erc20@v0.7.0',
                type: 'evm',
                cluster: 'c',
            });
            expect(result.balancesDatabases).toEqual({});
            expect(result.networkClusters.bsc).toBe('c');
        } finally {
            cleanup();
        }
    });

    it('should reject the split balances keys on non-EVM networks', () => {
        for (const key of ['balances-native', 'balances-erc20']) {
            const { path, cleanup } = writeYaml(`
clusters:
  a:
    url: http://localhost:8123
networks:
  solana:
    type: svm
    cluster: a
    ${key}: solana:svm-balances@v0.3.2
`);
            try {
                expect(() => loadDbsConfig(path)).toThrow(`Network solana: ${key} is only supported on EVM networks`);
            } finally {
                cleanup();
            }
        }
    });
});

describe('split balances key spellings', () => {
    it('should ignore other spellings of the split keys, like any unknown key', () => {
        const { path, cleanup } = writeYaml(`
clusters:
  a:
    url: http://localhost:8123
networks:
  solana:
    type: svm
    cluster: a
    balances: solana:svm-balances@v0.3.2
    balancesNative: x
    balances-erc-20: y
  mainnet:
    type: evm
    cluster: a
    balances-native: mainnet:evm-balances-native@v0.7.2
    balancesNative: mainnet:evm-balances@v0.3.3
`);
        try {
            const result = loadDbsConfig(path);
            expect(result.balancesNativeDatabases).toEqual({
                mainnet: { database: 'mainnet:evm-balances-native@v0.7.2', type: 'evm', cluster: 'a' },
            });
            expect(result.balancesErc20Databases).toEqual({});
            expect(result.balancesDatabases.solana?.database).toBe('solana:svm-balances@v0.3.2');
        } finally {
            cleanup();
        }
    });
});

describe('evmBalancesDatabase', () => {
    const mapping = (database: string) => ({ database, type: 'evm', cluster: 'c' });
    const cfg = {
        balancesDatabases: {
            mainnet: mapping('mainnet:evm-balances@v0.3.3'),
            bsc: mapping('bsc:evm-balances@v0.3.3'),
            base: mapping('base:evm-balances@v0.3.3'),
        },
        balancesNativeDatabases: {
            bsc: mapping('bsc:evm-balances-native@v0.7.2'),
            base: mapping('base:evm-balances-native@v0.7.2'),
        },
        balancesErc20Databases: {
            bsc: mapping('bsc:evm-balances-erc20@v0.7.0'),
            arbitrum: mapping('arbitrum:evm-balances-erc20@v0.7.0'),
        },
    };

    it('should read the split database of each side when configured', () => {
        expect(evmBalancesDatabase(cfg, 'bsc', 'native')?.database).toBe('bsc:evm-balances-native@v0.7.2');
        expect(evmBalancesDatabase(cfg, 'bsc', 'erc20')?.database).toBe('bsc:evm-balances-erc20@v0.7.0');
    });

    it('should fall back to the combined database for a side without a split key', () => {
        expect(evmBalancesDatabase(cfg, 'mainnet', 'native')?.database).toBe('mainnet:evm-balances@v0.3.3');
        expect(evmBalancesDatabase(cfg, 'mainnet', 'erc20')?.database).toBe('mainnet:evm-balances@v0.3.3');
        expect(evmBalancesDatabase(cfg, 'base', 'native')?.database).toBe('base:evm-balances-native@v0.7.2');
        expect(evmBalancesDatabase(cfg, 'base', 'erc20')?.database).toBe('base:evm-balances@v0.3.3');
    });

    it('should return undefined when neither the side nor the combined database is configured', () => {
        expect(evmBalancesDatabase(cfg, 'arbitrum', 'native')).toBeUndefined();
        expect(evmBalancesDatabase(cfg, 'arbitrum', 'erc20')?.database).toBe('arbitrum:evm-balances-erc20@v0.7.0');
        expect(evmBalancesDatabase(cfg, 'unknown', 'erc20')).toBeUndefined();
    });
});

describe('holders-native-cutoff', () => {
    it('should parse the cutoff of each EVM network without creating a database map', () => {
        const { path, cleanup } = writeYaml(`
clusters:
  c:
    url: http://localhost:8123
networks:
  base:
    type: evm
    cluster: c
    balances-native: base:evm-balances-native@v0.7.11
    holders-native-cutoff: 25
  unichain:
    type: evm
    cluster: c
    balances-native: unichain:evm-balances-native@v0.7.11
    holders-native-cutoff: 0.5
  mainnet:
    type: evm
    cluster: c
    balances-native: mainnet:evm-balances-native@v0.7.11
`);
        try {
            const result = loadDbsConfig(path);
            expect(result.holdersNativeCutoffs).toEqual({ base: 25, unichain: 0.5 });
            expect(result.balancesNativeDatabases.base?.database).toBe('base:evm-balances-native@v0.7.11');
            expect(Object.keys(result).filter((key) => key.toLowerCase().includes('cutoff'))).toEqual([
                'holdersNativeCutoffs',
            ]);
        } finally {
            cleanup();
        }
    });

    it('should reject the cutoff on non-EVM networks', () => {
        const { path, cleanup } = writeYaml(`
clusters:
  a:
    url: http://localhost:8123
networks:
  solana:
    type: svm
    cluster: a
    balances: solana:svm-balances@v0.3.2
    holders-native-cutoff: 100
`);
        try {
            expect(() => loadDbsConfig(path)).toThrow(
                'Network solana: holders-native-cutoff is only supported on EVM networks'
            );
        } finally {
            cleanup();
        }
    });

    it('should reject a cutoff that is not a positive amount with at most 18 decimals', () => {
        for (const value of ['0', '-5', '"25"', '0.0000000000000000001']) {
            const { path, cleanup } = writeYaml(`
clusters:
  c:
    url: http://localhost:8123
networks:
  base:
    type: evm
    cluster: c
    balances-native: base:evm-balances-native@v0.7.11
    holders-native-cutoff: ${value}
`);
            try {
                expect(() => loadDbsConfig(path)).toThrow();
            } finally {
                cleanup();
            }
        }
    });
});

describe('holdersNativeCutoff', () => {
    const cfg = { holdersNativeCutoffs: { base: 25, polygon: 100000 } };

    it('should use the configured cutoff of a network', () => {
        expect(holdersNativeCutoff(cfg, 'base')).toBe(25);
        expect(holdersNativeCutoff(cfg, 'polygon')).toBe(100000);
    });

    it('should fall back to the network default, then to the global default', () => {
        expect(holdersNativeCutoff(cfg, 'bsc')).toBe(100);
        expect(holdersNativeCutoff(cfg, 'mainnet')).toBe(5000);
        expect(holdersNativeCutoff({ holdersNativeCutoffs: {} }, 'base')).toBe(10);
        expect(holdersNativeCutoff(cfg, 'sonic')).toBe(DEFAULT_HOLDERS_NATIVE_CUTOFF);
        expect(holdersNativeCutoff(cfg, 'constructor')).toBe(DEFAULT_HOLDERS_NATIVE_CUTOFF);
    });
});

describe('nativeTokensToWei', () => {
    it('should convert whole and fractional amounts exactly', () => {
        expect(nativeTokensToWei(25)).toBe('25000000000000000000');
        expect(nativeTokensToWei(0.5)).toBe('500000000000000000');
        expect(nativeTokensToWei(2.25)).toBe('2250000000000000000');
        expect(nativeTokensToWei(0.000001)).toBe('1000000000000');
    });

    it('should give the cutoffs the SQL used before they became configurable', () => {
        for (const cutoff of [...Object.values(DEFAULT_HOLDERS_NATIVE_CUTOFFS), DEFAULT_HOLDERS_NATIVE_CUTOFF]) {
            expect(nativeTokensToWei(cutoff)).toBe(`${cutoff}${'0'.repeat(18)}`);
        }
    });

    it('should reject amounts it cannot write exactly', () => {
        expect(() => nativeTokensToWei(1e21)).toThrow();
        expect(() => nativeTokensToWei(1e-19)).toThrow();
        expect(() => nativeTokensToWei(-1)).toThrow();
        expect(() => nativeTokensToWei(Number.NaN)).toThrow();
    });
});
