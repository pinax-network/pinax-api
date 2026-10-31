import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

const ClusterConfigSchema = z.object({
    url: z.string().url({ message: 'Invalid cluster URL' }),
    username: z.string().optional(),
    password: z.string().optional(),
});

const NetworkConfigSchema = z
    .object({
        type: z.enum(['evm', 'svm', 'polymarket', 'hyperliquid']),
        cluster: z.string(),
        /** EVM only: the `/v1/evm/holders/native` cutoff, in whole native tokens. Not a database key. */
        'holders-native-cutoff': z.number().positive().optional(),
    })
    .catchall(z.string());

const DbsConfigSchema = z.object({
    clusters: z.record(z.string(), ClusterConfigSchema),
    networks: z.record(z.string(), NetworkConfigSchema),
});

export type ClusterConfig = z.infer<typeof ClusterConfigSchema>;
export type NetworkConfig = z.infer<typeof NetworkConfigSchema>;
export type DbsConfig = z.infer<typeof DbsConfigSchema>;

export interface NetworkDatabaseMapping {
    database: string;
    type: string;
    cluster: string;
}

type DatabaseMap = Record<string, NetworkDatabaseMapping>;

// Known database maps — add new entries here when onboarding new database types.
// The generic parser populates all of these from YAML `${key}` → `${key}Databases`;
// the split EVM balances keys map explicitly (`balances-native` → `balancesNativeDatabases`).
// `networkClusters` is the canonical network → cluster lookup; it does not
// depend on any specific database map, so cluster routing keeps working when
// a new database type is added without touching the routing layer.
export interface ParsedDbsConfig {
    clusters: Record<string, ClusterConfig>;
    networkClusters: Record<string, string>;
    balancesDatabases: DatabaseMap;
    /** EVM only: the native balances database (evm-balances-native), split from `balances`. */
    balancesNativeDatabases: DatabaseMap;
    /** EVM only: the ERC-20 balances database (evm-balances-erc20), split from `balances`. */
    balancesErc20Databases: DatabaseMap;
    transfersDatabases: DatabaseMap;
    accountsDatabases: DatabaseMap;
    metadataDatabases: DatabaseMap;
    nftsDatabases: DatabaseMap;
    dexesDatabases: DatabaseMap;
    contractsDatabases: DatabaseMap;
    polymarketDatabases: DatabaseMap;
    scraperDatabases: DatabaseMap;
    hypercoreDatabases: DatabaseMap;
    /** EVM only: `holders-native-cutoff` per network, in whole native tokens. Not a database map. */
    holdersNativeCutoffs: Record<string, number>;
}

function emptyConfig(): ParsedDbsConfig {
    return {
        clusters: {},
        networkClusters: {},
        balancesDatabases: {},
        balancesNativeDatabases: {},
        balancesErc20Databases: {},
        transfersDatabases: {},
        accountsDatabases: {},
        metadataDatabases: {},
        nftsDatabases: {},
        dexesDatabases: {},
        contractsDatabases: {},
        polymarketDatabases: {},
        scraperDatabases: {},
        hypercoreDatabases: {},
        holdersNativeCutoffs: {},
    };
}

/** Per-network keys of the split EVM balances databases, and their maps. */
const SPLIT_BALANCES_KEYS: Record<string, keyof ParsedDbsConfig> = {
    'balances-native': 'balancesNativeDatabases',
    'balances-erc20': 'balancesErc20Databases',
};
const SPLIT_BALANCES_PROPS = new Set(Object.values(SPLIT_BALANCES_KEYS));

/**
 * The database an EVM balances route reads on `network`: the split database of
 * its side (`balances-native` or `balances-erc20`) when configured, else the
 * combined `balances` database, which holds both sides.
 */
export function evmBalancesDatabase(
    cfg: Pick<ParsedDbsConfig, 'balancesDatabases' | 'balancesNativeDatabases' | 'balancesErc20Databases'>,
    network: string,
    side: 'native' | 'erc20'
): NetworkDatabaseMapping | undefined {
    const split = side === 'native' ? cfg.balancesNativeDatabases : cfg.balancesErc20Databases;
    return split[network] ?? cfg.balancesDatabases[network];
}

/**
 * `/v1/evm/holders/native` ranks only addresses that have ever held at least a cutoff, which
 * keeps its scan small through the balance min-max skip index. These defaults, in whole native
 * tokens, apply to networks without `holders-native-cutoff`. The route ranks exactly as many
 * holders as hold the cutoff now, so a good cutoff leaves more of them than the deepest page
 * served (1,000 holders, plus margin), and is otherwise as high as possible: a higher cutoff
 * scans less. Holders at or above N, now:
 * SELECT count() FROM (SELECT argMax(balance, block_num) AS b FROM native_balances
 *     WHERE address IN (SELECT address FROM native_balances WHERE balance >= toUInt256(N) * toUInt256(1e18))
 *     GROUP BY address) WHERE b >= toUInt256(N) * toUInt256(1e18);
 */
export const DEFAULT_HOLDERS_NATIVE_CUTOFFS: Record<string, number> = {
    unichain: 1,
    optimism: 10,
    base: 10,
    'arbitrum-one': 100,
    bsc: 100,
    avalanche: 1000,
    mainnet: 5000,
    polygon: 50000,
};
export const DEFAULT_HOLDERS_NATIVE_CUTOFF = 100;

/** The `/v1/evm/holders/native` cutoff of `network`, in whole native tokens. */
export function holdersNativeCutoff(cfg: Pick<ParsedDbsConfig, 'holdersNativeCutoffs'>, network: string): number {
    if (Object.hasOwn(cfg.holdersNativeCutoffs, network)) {
        return cfg.holdersNativeCutoffs[network] as number;
    }
    if (Object.hasOwn(DEFAULT_HOLDERS_NATIVE_CUTOFFS, network)) {
        return DEFAULT_HOLDERS_NATIVE_CUTOFFS[network] as number;
    }
    return DEFAULT_HOLDERS_NATIVE_CUTOFF;
}

const NATIVE_DECIMALS = 18;

/**
 * Whole native tokens to wei (18 decimals), exactly, as a decimal string for a UInt256 query
 * parameter: `25` → `25000000000000000000`. Throws on more than 18 decimal places and on
 * amounts that only have an exponent notation, such as `1e21`.
 */
export function nativeTokensToWei(amount: number): string {
    const [whole = '', fraction = ''] = String(amount).split('.');
    if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction) || fraction.length > NATIVE_DECIMALS) {
        throw new Error(`Invalid native token amount: ${amount}`);
    }
    return (BigInt(whole) * 10n ** BigInt(NATIVE_DECIMALS) + BigInt(fraction.padEnd(NATIVE_DECIMALS, '0'))).toString();
}

export function loadDbsConfig(configPath?: string): ParsedDbsConfig {
    if (!configPath) {
        return emptyConfig();
    }

    const absolutePath = resolve(configPath);

    if (!existsSync(absolutePath)) {
        return emptyConfig();
    }

    const fileContent = readFileSync(absolutePath, 'utf-8');
    const rawConfig = parse(fileContent);
    const config = DbsConfigSchema.parse(rawConfig);

    const result: ParsedDbsConfig = {
        ...emptyConfig(),
        clusters: config.clusters,
    };

    for (const [networkId, networkConfig] of Object.entries(config.networks)) {
        if (!config.clusters[networkConfig.cluster]) {
            throw new Error(`Cluster ${networkConfig.cluster} not found`);
        }
        const { type, cluster, 'holders-native-cutoff': holdersNativeCutoff, ...databases } = networkConfig;
        const mapping = { type, cluster };
        result.networkClusters[networkId] = cluster;

        if (holdersNativeCutoff !== undefined) {
            if (type !== 'evm') {
                throw new Error(`Network ${networkId}: holders-native-cutoff is only supported on EVM networks`);
            }
            try {
                nativeTokensToWei(holdersNativeCutoff);
            } catch {
                throw new Error(
                    `Network ${networkId}: holders-native-cutoff ${holdersNativeCutoff} is not a whole-token amount with at most ${NATIVE_DECIMALS} decimals`
                );
            }
            result.holdersNativeCutoffs[networkId] = holdersNativeCutoff;
        }

        for (const [key, dbName] of Object.entries(databases)) {
            const split = Object.hasOwn(SPLIT_BALANCES_KEYS, key) ? SPLIT_BALANCES_KEYS[key] : undefined;
            if (split && type !== 'evm') {
                throw new Error(`Network ${networkId}: ${key} is only supported on EVM networks`);
            }
            const prop = split ?? (`${key}Databases` as keyof ParsedDbsConfig);
            // Only the documented keys reach the split maps (`balancesNative` is an unknown key).
            if (!split && SPLIT_BALANCES_PROPS.has(prop)) {
                continue;
            }
            const map = result[prop];
            if (map && typeof map === 'object' && !Array.isArray(map)) {
                (map as DatabaseMap)[networkId] = { database: dbName, ...mapping };
            }
        }
    }

    return result;
}
