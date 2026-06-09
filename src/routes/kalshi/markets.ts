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
    kalshiEventTickerSchema,
    kalshiMarketStatusSchema,
    kalshiSeriesSchema,
    kalshiTickerSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './markets.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    ticker: { schema: kalshiTickerSchema, optional: true },
    series: { schema: kalshiSeriesSchema, optional: true },
    event_ticker: { schema: kalshiEventTickerSchema, optional: true },
    status: { schema: kalshiMarketStatusSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            ticker: z.string(),
            series: z.string(),
            event_ticker: z.string(),
            mve_collection_ticker: z.string().nullable(),
            market_type: z.string(),
            status: z.string(),
            title: z.string(),
            created_time: dateTimeSchema,
            close_time: dateTimeSchema.nullable(),
            updated_time: dateTimeSchema,
            result: z.string().nullable(),
            settlement_value: z.number().nullable(),
            expiration_value: z.number().nullable(),
            yes_bid: z.number(),
            yes_ask: z.number(),
            no_bid: z.number(),
            no_ask: z.number(),
            last_price: z.number(),
            volume: z.number(),
            volume_24h: z.number(),
            open_interest: z.number(),
            notional_value: z.number(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Markets',
        description:
            'Settled Kalshi markets with their resolution snapshot — `status`, `result`, `settlement_value`, plus end-of-life bid/ask/last_price/volume/open_interest. Live/open markets will be filled in by a future scraper join; for now only `determined`/`finalized` markets appear.\n\nFilter by `ticker`, `series` (e.g. `KXBTCD`), or `event_ticker` (the `SERIES-EVENT` prefix).',
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
                                            ticker: 'KXBTCD-26APR3020-T76299.99',
                                            series: 'KXBTCD',
                                            event_ticker: 'KXBTCD-26APR3020',
                                            mve_collection_ticker: null,
                                            market_type: 'binary',
                                            status: 'finalized',
                                            title: 'Bitcoin price  on Apr 30, 2026?',
                                            created_time: '2026-04-29 09:02:06',
                                            close_time: '2026-05-01 00:00:00',
                                            updated_time: '2026-05-01 00:03:16',
                                            result: 'no',
                                            settlement_value: 0,
                                            expiration_value: 76294.39,
                                            yes_bid: 0,
                                            yes_ask: 1,
                                            no_bid: 0,
                                            no_ask: 1,
                                            last_price: 0.01,
                                            volume: 551805,
                                            volume_24h: 0,
                                            open_interest: 144893.94,
                                            notional_value: 1,
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
