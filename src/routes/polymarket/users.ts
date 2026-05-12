import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import {
    apiUsageResponseSchema,
    createQuerySchema,
    evmAddress,
    polymarketUserSortBySchema,
    userLookbackIntervalSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import baseQuery from './users.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    user: { schema: evmAddress, batched: true, optional: true },
    interval: { schema: userLookbackIntervalSchema, optional: true },
    sort_by: { schema: polymarketUserSortBySchema, prefault: 'total_volume' },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            user: z.string(),
            buys: z.number(),
            sells: z.number(),
            transactions: z.number(),
            volume_bought: z.number(),
            volume_sold: z.number(),
            total_volume: z.number(),
            realized_pnl: z.number(),
            unrealized_pnl: z.number(),
            total_pnl: z.number(),
            first_trade: z.string(),
            last_trade: z.string(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'User Lookup',
        description:
            'Returns trading statistics per user: volume, PNL (realized, unrealized, total), trade counts, and activity window. When no user address is provided, returns a paginated leaderboard for discovery.\n\nSupports lookback windows via `interval`: `1h`, `1d`, `1w`, `30d`. Omit for all-time. Data refreshes hourly.',
        tags: ['Polymarket Users'],
        security: [{ bearerAuth: [] }],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': {
                        schema: resolver(responseSchema),
                        examples: {
                            leaderboard: {
                                value: {
                                    data: [
                                        {
                                            user: '0x4ce73141dbfce41e65db3723e31059a730f0abad',
                                            buys: 32168,
                                            sells: 294299,
                                            transactions: 326467,
                                            volume_bought: 11882418.59,
                                            volume_sold: 35795922.98,
                                            total_volume: 47678341.57,
                                            realized_pnl: 23913504.39,
                                            unrealized_pnl: 12090462.43,
                                            total_pnl: 36003966.82,
                                            first_trade: '2024-05-30 00:00:00',
                                            last_trade: '2024-11-28 00:00:00',
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

const route = new Hono<{ Variables: { validatedData: z.infer<typeof querySchema> } }>();

route.get('/', openapi, zValidator('query', querySchema, validatorHook), validator('query', querySchema), async (c) => {
    const params = c.req.valid('query');

    const db = config.polymarketDatabases.polymarket;
    if (!db) {
        return c.json({ error: 'Polymarket not configured' }, 500);
    }

    const fragments = [baseQuery];
    fragments.push(`ORDER BY ${params.sort_by} DESC LIMIT {limit:UInt64} OFFSET {offset:UInt64}`);

    const response = await makeUsageQueryJson(c, fragments, {
        ...params,
        interval_min: params.interval ?? 0,
        network: 'polymarket',
        db_polymarket: db.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
