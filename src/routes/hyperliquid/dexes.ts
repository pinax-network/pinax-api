import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import { apiUsageResponseSchema, hyperliquidDexIdSchema } from '../../types/zod.js';
import { withErrorResponses } from '../../utils.js';

import baseQuery from './dexes.sql' with { type: 'text' };

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            dex: hyperliquidDexIdSchema,
            assets: z.number().int(),
            volume_24h: z.number(),
            trades_24h: z.number().int(),
            unique_users_24h: z.number().int(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Supported DEXs',
        description:
            'Returns the list of perpetuals DEXs and spot, each with 24h activity stats (volume, trade count, unique users, asset count). Hyperliquid hosts a core perpetuals venue (`dex=perps`) alongside builder-deployed perpetuals DEXs that each list their own asset universe — `xyz` (commodities and macro indices), `cash` (tokenized equities), `km`, and others.\n\nUse this endpoint to discover valid `dex` filter values for venue-scoped queries on `/markets`, `/markets/activity`, `/markets/liquidations`, `/users`, and `/users/positions`.\n\nFor platform-wide totals across all DEXs over arbitrary intervals, use `/v1/hyperliquid/platform`.\n\n**Public — no auth required.**',
        tags: ['Hyperliquid Markets'],
        security: [],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': {
                        schema: resolver(responseSchema),
                        examples: {
                            default: {
                                value: {
                                    data: [
                                        {
                                            dex: 'perps',
                                            assets: 192,
                                            volume_24h: 3587190584.83,
                                            trades_24h: 1780780,
                                            unique_users_24h: 7663,
                                        },
                                        {
                                            dex: 'xyz',
                                            assets: 48,
                                            volume_24h: 412857192.13,
                                            trades_24h: 245118,
                                            unique_users_24h: 1842,
                                        },
                                        {
                                            dex: 'spot',
                                            assets: 275,
                                            volume_24h: 89724108.55,
                                            trades_24h: 154297,
                                            unique_users_24h: 943,
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

const route = new Hono();

route.get('/', openapi, async (c) => {
    const hypercore = config.hypercoreDatabases.hyperliquid;
    if (!hypercore) {
        return c.json({ error: 'Hyperliquid not configured' }, 500);
    }

    const response = await makeUsageQueryJson(c, [baseQuery], {
        network: 'hyperliquid',
        db_hypercore: hypercore.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
