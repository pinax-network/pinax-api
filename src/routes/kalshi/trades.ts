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
    kalshiSeriesSchema,
    kalshiTickerSchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './trades.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    ticker: { schema: kalshiTickerSchema, optional: true },
    series: { schema: kalshiSeriesSchema, optional: true },
    start_time: { schema: timestampSchema, optional: true },
    end_time: { schema: timestampSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            trade_id: z.string(),
            ticker: z.string(),
            series: z.string(),
            timestamp: dateTimeSchema,
            // Stringified because microseconds-since-epoch already sits within
            // ~5x of Number.MAX_SAFE_INTEGER; safer to ship as string and match
            // the Polymarket BigInt-as-string precedent.
            timestamp_us: z.string(),
            count: z.number(),
            yes_price: z.number(),
            no_price: z.number(),
            taker_outcome_side: z.string(),
            taker_book_side: z.string(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Trades',
        description:
            'Returns fill-by-fill trade history for Kalshi markets. Filter by `ticker` (a specific market) or `series` (the leading dash-segment of a ticker, e.g. `KXNBAGAME`).\n\nPrices are dollars-per-share (0 to 1); `yes_price + no_price = 1`. `timestamp_us` is microseconds-since-epoch for ordering trades that share the same second.',
        tags: ['Kalshi Markets'],
        security: [{ bearerAuth: [] }],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': {
                        schema: resolver(responseSchema),
                        examples: {
                            by_ticker: {
                                value: {
                                    data: [
                                        {
                                            trade_id: 'e69d9119-9534-71f6-2ebc-1e56f84a9d74',
                                            ticker: 'KXNBAGAME-26APR30NYKATL-ATL',
                                            series: 'KXNBAGAME',
                                            timestamp: '2026-05-01 00:09:58',
                                            timestamp_us: '1777594198406705',
                                            count: 187.03,
                                            yes_price: 0.01,
                                            no_price: 0.99,
                                            taker_outcome_side: 'yes',
                                            taker_book_side: 'bid',
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

    if (!params.ticker && !params.series && !params.start_time) {
        return c.json(
            {
                status: 400,
                code: 'bad_query_input',
                message: 'Provide at least one of ticker, series, or start_time',
            },
            400
        );
    }

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
