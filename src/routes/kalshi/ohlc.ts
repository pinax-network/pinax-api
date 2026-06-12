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
    kalshiIntervalSchema,
    kalshiTickerSchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './ohlc.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    ticker: { schema: kalshiTickerSchema },
    interval: { schema: kalshiIntervalSchema, prefault: '1d' },
    start_time: { schema: timestampSchema, optional: true },
    end_time: { schema: timestampSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            timestamp: dateTimeSchema,
            ticker: z.string(),
            series: z.string(),
            interval_min: z.number(),
            open: z.number(),
            high: z.number(),
            low: z.number(),
            close: z.number(),
            mean: z.number().nullable(),
            volume: z.number(),
            transactions: z.number(),
            buys: z.number(),
            sells: z.number(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Market OHLC',
        description:
            'OHLCV bars per market ticker at 1-minute, 1-hour, or 1-day granularity. Mirrors Kalshi `/markets/candlesticks` intervals. Prices are on the YES side; volume is in contracts.\n\n`mean` is volume-weighted (VWAP), matching Kalshi `price.mean_dollars`. May be `null` for empty bars.',
        tags: ['Kalshi Markets'],
        security: [{ bearerAuth: [] }],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': {
                        schema: resolver(responseSchema),
                        examples: {
                            hourly: {
                                value: {
                                    data: [
                                        {
                                            timestamp: '2026-05-01 00:00:00',
                                            ticker: 'KXNBAGAME-26APR30NYKATL-ATL',
                                            series: 'KXNBAGAME',
                                            interval_min: 60,
                                            open: 0.01,
                                            high: 0.01,
                                            low: 0.01,
                                            close: 0.01,
                                            mean: 0.01,
                                            volume: 699354.41,
                                            transactions: 832,
                                            buys: 832,
                                            sells: 0,
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

    const db = config.kalshiDatabases.kalshi;
    if (!db) {
        return c.json({ error: 'Kalshi not configured' }, 500);
    }

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        network: 'kalshi',
        db_kalshi: db.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
