import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import client from '../clickhouse/client.js';
import { config } from '../config.js';
import { withErrorResponses } from '../utils.js';

const healthResponseSchema = z.object({
    status: z.string(),
});

const errorResponseSchema = z.object({
    status: z.string(),
    error: z.string(),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Health Check',
        description: 'Returns the status of all database connections used by the API.',
        tags: ['Monitoring'],
        responses: {
            200: {
                description: 'All database connections are healthy',
                content: {
                    'application/json': {
                        schema: resolver(healthResponseSchema),
                        examples: {
                            example: {
                                summary: 'Healthy',
                                value: { status: 'OK' },
                            },
                        },
                    },
                },
            },
            503: {
                description: 'One or more database connections failed',
                content: {
                    'application/json': {
                        schema: resolver(errorResponseSchema),
                        examples: {
                            example: {
                                summary: 'Unhealthy',
                                value: { status: 'ERROR', error: 'Database ping failed for cluster default' },
                            },
                        },
                    },
                },
            },
        },
    })
);

const route = new Hono();

route.get('/health', openapi, async (c) => {
    // Ping each unique cluster to verify DB connections
    const pingedClusters = new Set<string>();
    const pingPromises: Promise<void>[] = [];

    for (const network of config.networks) {
        const networkDb =
            config.balancesDatabases[network] ||
            config.transfersDatabases[network] ||
            config.nftsDatabases[network] ||
            config.dexesDatabases[network] ||
            config.contractsDatabases[network];

        if (!networkDb || pingedClusters.has(networkDb.cluster)) continue;
        pingedClusters.add(networkDb.cluster);

        pingPromises.push(
            (async () => {
                const response = await client({ network }).ping();
                if (!response.success) {
                    throw new Error(`Database ping failed for cluster ${networkDb.cluster}`);
                }
            })()
        );
    }

    try {
        await Promise.all(pingPromises);
        return c.json({ status: 'OK' });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown database connection error';
        return c.json({ status: 'ERROR', error: message }, 503);
    }
});

export default route;
