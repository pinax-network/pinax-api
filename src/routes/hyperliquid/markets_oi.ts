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
    hyperliquidCoinSchema,
    hyperliquidDexIdSchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './markets_oi.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    coin: { schema: hyperliquidCoinSchema, batched: true },
    dex: { schema: hyperliquidDexIdSchema, batched: true, optional: true },
    interval: { schema: evmIntervalSchema, prefault: '1h' },
    start_time: { schema: timestampSchema, optional: true },
    end_time: { schema: timestampSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            timestamp: dateTimeSchema,
            coin: z.string(),
            market_name: z.string(),
            dex: z.string(),
            interval_min: z.number().int(),
            open_interest: z.number(),
            net_position: z.number(),
            long_size: z.number(),
            short_size: z.number(),
            long_positions: z.number().int(),
            short_positions: z.number().int(),
            funding_rate: z.number(),
            total_funding: z.number(),
            positive_funding: z.number(),
            negative_funding: z.number(),
            funding_events: z.number().int(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Market Open Interest',
        description:
            'Returns the historical open-interest and funding-rate time series for a coin at the requested interval. `open_interest` is the sum of absolute signed position sizes across all users at each funding snapshot.\n\nEach row also exposes the directional positioning split (`long_size`, `short_size`, `net_position`, plus `long_positions` and `short_positions` as user counts) and funding aggregates (`funding_rate`, `total_funding`, `positive_funding`, `negative_funding`) — useful for detecting crowded sides, funding pressure, and position flushes.',
        tags: ['Hyperliquid Markets'],
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
                                            timestamp: '2026-04-30 23:00:00',
                                            coin: 'BTC',
                                            market_name: 'BTC',
                                            dex: 'perps',
                                            interval_min: 60,
                                            open_interest: 27984.45,
                                            net_position: 0,
                                            long_size: 13992.23,
                                            short_size: -13992.23,
                                            long_positions: 16381,
                                            short_positions: 14034,
                                            funding_rate: -0.0000154515,
                                            total_funding: -0.001199,
                                            positive_funding: 16482.55,
                                            negative_funding: -16482.55,
                                            funding_events: 30415,
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
