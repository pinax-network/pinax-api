import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import {
    apiUsageResponseSchema,
    createQuerySchema,
    hyperliquidCoinSchema,
    hyperliquidDexIdSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import baseQuery from './markets.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    coin: { schema: hyperliquidCoinSchema, optional: true },
    dex: { schema: hyperliquidDexIdSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            coin: z.string(),
            dex: z.string(),
            price: z.number(),
            price_24h: z.number().nullable(),
            price_24h_change: z.number(),
            volume_24h: z.number(),
            buy_volume_24h: z.number(),
            ask_volume_24h: z.number(),
            trades_24h: z.number().int(),
            unique_users_24h: z.number().int(),
            open_interest: z.number().nullable(),
            funding_rate: z.number().nullable(),
            funding_snapshot_time: z.string().nullable(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Market Lookup',
        description:
            'Returns the latest snapshot per coin: last trade price, 24h change versus the prior-day close, 24h volume (split by side), trade and unique-user counts, and the most recent open interest and funding rate observed at the last funding snapshot.\n\n`coin` and `dex` compose additively — pass either or both to narrow the scope (a mismatched pair like `coin=cash:TSLA&dex=xyz` returns empty). Omit both for a full listing sorted by 24h volume.',
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
                                            coin: 'BTC',
                                            dex: 'perps',
                                            price: 75944,
                                            price_24h: 76765,
                                            price_24h_change: -0.010695,
                                            volume_24h: 2322418448.58,
                                            buy_volume_24h: 1216305333.99,
                                            ask_volume_24h: 1106113114.59,
                                            trades_24h: 454294,
                                            unique_users_24h: 4581,
                                            open_interest: 27608.56,
                                            funding_rate: 0.0000037749,
                                            funding_snapshot_time: '2026-04-28 15:00:00',
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

    const hypercore = config.hypercoreDatabases.hyperliquid;
    if (!hypercore) {
        return c.json({ error: 'Hyperliquid not configured' }, 500);
    }

    const response = await makeUsageQueryJson(c, [baseQuery], {
        ...params,
        network: 'hyperliquid',
        db_hypercore: hypercore.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
