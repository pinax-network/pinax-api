import { zValidator } from '@hono/zod-validator';
import { NetworksRegistry } from '@pinax/graph-networks-registry';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import client from '../clickhouse/client.js';
import { config } from '../config.js';
import { extractVersion } from '../extractVersion.js';
import { logger } from '../logger.js';
import { createQuerySchema } from '../types/zod.js';
import { validatorHook, withErrorResponses } from '../utils.js';

const registry = await NetworksRegistry.fromLatestVersion();

const route = new Hono();

const networkIdSchema = z
    .string()
    .refine((val) => config.networks.includes(val), { message: 'Invalid network ID' })
    .meta({
        description: 'Network ID to filter by',
        example: config.networks[0],
    });

const querySchema = createQuerySchema(
    {
        network: { schema: networkIdSchema, batched: true, optional: true },
    },
    false
);

const indexedToEntrySchema = z.object({
    category: z.string(),
    version: z.string(),
    block_num: z.number(),
    datetime: z.string(),
    timestamp: z.number(),
});

const networkResponseSchema = z.object({
    id: z.string(),
    fullName: z.string(),
    shortName: z.string(),
    caip2Id: z.string(),
    networkType: z.string(),
    icon: z.object({
        web3Icons: z.object({
            name: z.string(),
        }),
    }),
    aliases: z.array(z.string()),
    indexed_to: z.array(indexedToEntrySchema),
});

const responseSchema = z.object({
    networks: z.array(networkResponseSchema),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Supported Networks',
        description:
            'Returns supported blockchain networks with identifiers, metadata, and per-category indexing freshness.',
        tags: ['Monitoring'],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': {
                        schema: resolver(responseSchema),
                        examples: {
                            example: {
                                value: {
                                    networks: [
                                        {
                                            ...getNetwork('mainnet'),
                                            indexed_to: [
                                                {
                                                    category: 'transfers',
                                                    version: '0.2.2',
                                                    block_num: 24278225,
                                                    datetime: '2026-01-20 19:57:11',
                                                    timestamp: 1768939031,
                                                },
                                            ],
                                        },
                                    ],
                                },
                            },
                        },
                    },
                },
            },
        },
    })
);

export function getNetwork(id: string) {
    const network = registry.getNetworkByGraphId(id);
    if (!network) {
        logger.warn(`Network ${id} not found`);
        return {};
    }

    return {
        id,
        fullName: network.fullName,
        shortName: network.shortName,
        networkType: network.networkType,
        nativeToken: network.nativeToken,
        caip2Id: network.caip2Id,
        icon: network.icon,
        aliases: network.aliases,
    };
}

interface DbEntry {
    category: string;
    network: string;
    database: string;
    cluster: string;
}

interface IndexedToRow {
    category: string;
    network: string;
    version: string;
    block_num: number;
    datetime: string;
    timestamp: number;
}

interface IndexedToEntry {
    category: string;
    version: string;
    block_num: number;
    datetime: string;
    timestamp: number;
}

/** Collect all DB entries with category labels */
function collectDbEntries(): DbEntry[] {
    const entries: DbEntry[] = [];
    const categories: [string, Record<string, { database: string; cluster: string }>][] = [
        ['transfers', config.transfersDatabases],
        ['balances', config.balancesDatabases],
        ['dexes', config.dexesDatabases],
    ];
    for (const [category, databases] of categories) {
        for (const [network, mapping] of Object.entries(databases)) {
            entries.push({ category, network, database: mapping.database, cluster: mapping.cluster });
        }
    }
    return entries;
}

/** Build a single SQL query using UNION ALL subqueries for all databases on a cluster */
function buildIndexedToQuery(entries: DbEntry[]): string {
    const subqueries = entries.map(
        (e) =>
            `SELECT '${e.category}' as category, '${e.network}' as network, '${extractVersion(e.database)}' as version, b.block_num as block_num, b.timestamp as datetime, toUnixTimestamp(b.timestamp) as timestamp FROM \`${e.database}\`.blocks as b WHERE b.block_num = (SELECT max(block_num) FROM \`${e.database}\`.blocks)`
    );
    return subqueries.join(' UNION ALL ');
}

/** Parse query rows into a map of network → indexed_to entries */
function buildIndexedToByNetwork(rows: IndexedToRow[]): Map<string, IndexedToEntry[]> {
    const result = new Map<string, IndexedToEntry[]>();
    for (const row of rows) {
        const entries = result.get(row.network) ?? [];
        entries.push({
            category: row.category,
            version: row.version,
            block_num: Number(row.block_num),
            datetime: row.datetime,
            timestamp: Number(row.timestamp),
        });
        result.set(row.network, entries);
    }
    return result;
}

/** Query indexed_to information for all database categories */
async function queryIndexedTo(): Promise<Map<string, IndexedToEntry[]>> {
    const allEntries = collectDbEntries();

    // Group entries by cluster to send one query per cluster
    const byCluster = new Map<string, DbEntry[]>();
    for (const entry of allEntries) {
        const group = byCluster.get(entry.cluster) ?? [];
        group.push(entry);
        byCluster.set(entry.cluster, group);
    }

    // Execute one query per cluster in parallel
    const clusterResults = await Promise.all(
        [...byCluster.entries()]
            .filter(([, entries]) => entries.length > 0)
            .map(async ([, entries]) => {
                const query = buildIndexedToQuery(entries);
                const result = await client({ network: entries[0]?.network }).query({ query, format: 'JSONEachRow' });
                return result.json<IndexedToRow>();
            })
    );

    return buildIndexedToByNetwork(clusterResults.flat());
}

async function validateNetworks() {
    if (config.skipNetworksValidation) return;

    if (
        !config.networks.includes(config.defaultEvmNetwork) &&
        !config.networks.includes(config.defaultSvmNetwork) &&
        !config.networks.includes(config.defaultTvmNetwork)
    ) {
        throw new Error('Default network for EVM, SVM or TVM not found');
    }

    // Group networks by their cluster
    const networksByCluster = new Map<string, string[]>();
    for (const network of config.networks) {
        const networkDb =
            config.balancesDatabases[network] ||
            config.transfersDatabases[network] ||
            config.nftsDatabases[network] ||
            config.dexesDatabases[network] ||
            config.contractsDatabases[network];

        if (!networkDb) {
            throw new Error(`No database configuration found for network: ${network}`);
        }

        const clusterName = networkDb.cluster;
        if (!networksByCluster.has(clusterName)) {
            networksByCluster.set(clusterName, []);
        }
        networksByCluster.get(clusterName)?.push(network);
    }

    // Validate each network against its cluster
    const query = 'SHOW DATABASES';
    for (const [clusterName, networks] of networksByCluster) {
        const result = await client({ network: networks[0] }).query({ query, format: 'JSONEachRow' });
        const dbs = await result.json<{ name: string }>();
        const dbs_networks = new Set(dbs.map((db) => db.name.split(':')[0]));

        for (const network of networks) {
            if (!dbs_networks.has(network)) {
                throw new Error(`Databases for ${network} not found in cluster ${clusterName}`);
            }
        }
    }
}

// store networks in memory
// this is a workaround to avoid loading networks from the database on every request
await validateNetworks();

logger.trace('Supported networks:\n', config.networks);
logger.trace(`Default EVM network: ${config.defaultEvmNetwork}`);
logger.trace(`Default SVM network: ${config.defaultSvmNetwork}`);
logger.trace(`Default TVM network: ${config.defaultTvmNetwork}`);

route.get(
    '/networks',
    openapi,
    zValidator('query', querySchema, validatorHook),
    validator('query', querySchema),
    async (c) => {
        const params = c.req.valid('query');
        const filterNetworks: string[] = params.network;

        const indexedToByNetwork = await queryIndexedTo();

        let networkIds = config.networks;
        if (filterNetworks.length > 0) {
            networkIds = networkIds.filter((id) => filterNetworks.includes(id));
        }

        return c.json({
            networks: networkIds
                .map((id) => ({
                    ...getNetwork(id),
                    indexed_to: indexedToByNetwork.get(id) ?? [],
                }))
                .sort((a, b) => {
                    return a.id && b.id ? a.id.localeCompare(b.id) : -1;
                }),
        });
    }
);

export default route;
