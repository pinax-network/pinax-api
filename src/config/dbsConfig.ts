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
        type: z.enum(['evm', 'svm', 'tvm', 'polymarket', 'hyperliquid', 'kalshi']),
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
// The generic parser populates all of these from YAML `${key}` → `${key}Databases`.
// `networkClusters` is the canonical network → cluster lookup; it does not
// depend on any specific database map, so cluster routing keeps working when
// a new database type is added without touching the routing layer.
export interface ParsedDbsConfig {
    clusters: Record<string, ClusterConfig>;
    networkClusters: Record<string, string>;
    balancesDatabases: DatabaseMap;
    transfersDatabases: DatabaseMap;
    accountsDatabases: DatabaseMap;
    metadataDatabases: DatabaseMap;
    nftsDatabases: DatabaseMap;
    dexesDatabases: DatabaseMap;
    contractsDatabases: DatabaseMap;
    polymarketDatabases: DatabaseMap;
    scraperDatabases: DatabaseMap;
    hypercoreDatabases: DatabaseMap;
    kalshiDatabases: DatabaseMap;
}

function emptyConfig(): ParsedDbsConfig {
    return {
        clusters: {},
        networkClusters: {},
        balancesDatabases: {},
        transfersDatabases: {},
        accountsDatabases: {},
        metadataDatabases: {},
        nftsDatabases: {},
        dexesDatabases: {},
        contractsDatabases: {},
        polymarketDatabases: {},
        scraperDatabases: {},
        hypercoreDatabases: {},
        kalshiDatabases: {},
    };
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
            const prop = `${key}Databases` as keyof ParsedDbsConfig;
            const map = result[prop];
            if (map && typeof map === 'object' && !Array.isArray(map)) {
                (map as DatabaseMap)[networkId] = { database: dbName, ...mapping };
            }
        }
    }

    return result;
}
