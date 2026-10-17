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
        const { type, cluster, ...databases } = networkConfig;
        const mapping = { type, cluster };
        result.networkClusters[networkId] = cluster;

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
