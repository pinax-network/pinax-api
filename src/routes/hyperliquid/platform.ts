import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import {
    apiUsageResponseSchema,
    createQuerySchema,
    dateTimeSchema,
    evmIntervalSchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './platform.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    interval: { schema: evmIntervalSchema, prefault: '1d' },
    start_time: { schema: timestampSchema, optional: true },
    end_time: { schema: timestampSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            timestamp: dateTimeSchema,
            interval_min: z.number().int(),
            volume: z.number(),
            buy_volume: z.number(),
            sell_volume: z.number(),
            transactions: z.number().int(),
            buys: z.number().int(),
            sells: z.number().int(),
            active_coins: z.number().int(),
            total_fees: z.number(),
            liquidations_volume: z.number(),
            liquidations_count: z.number().int(),
            unique_liquidated_users: z.number().int(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Platform Activity',
        description:
            'Returns a platform-wide time series aggregating all coins and DEXs into one row per `timestamp`. Each row carries trade volume (split by side), trade and counterparty counts, distinct active coins, total fees, and a liquidation slice (`liquidations_volume`, `liquidations_count`, `unique_liquidated_users`).\n\nUse this endpoint instead of summing per-coin or per-DEX data client-side when you need cross-market totals. Per-coin OHLCV lives on `/v1/hyperliquid/markets/ohlc`; per-DEX on `/v1/hyperliquid/dexes`.',
        tags: ['Hyperliquid Platform'],
        security: [{ bearerAuth: [] }],
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
                                            timestamp: '2026-04-30 00:00:00',
                                            interval_min: 1440,
                                            volume: 8137264556.87,
                                            buy_volume: 4191715134.16,
                                            sell_volume: 3945549422.71,
                                            transactions: 5881845,
                                            buys: 2928397,
                                            sells: 2953448,
                                            active_coins: 391,
                                            total_fees: 469081.69,
                                            liquidations_volume: 16898784.51,
                                            liquidations_count: 3950,
                                            unique_liquidated_users: 1956,
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

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        network: 'hyperliquid',
        db_hypercore: hypercore.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
