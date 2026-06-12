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
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './series.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    series: { schema: kalshiSeriesSchema, optional: true },
    start_time: { schema: timestampSchema, optional: true },
    end_time: { schema: timestampSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            series: z.string(),
            market_count: z.number(),
            volume: z.number(),
            trades: z.number(),
            buys: z.number(),
            sells: z.number(),
            first_trade: dateTimeSchema,
            last_trade: dateTimeSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Series',
        description:
            'Lists Kalshi series ranked by traded volume. A series is the leading dash-segment of a market ticker (e.g. `KXNBAGAME`, `KXBTC15M`) — Kalshi\'s contract template above the event/market level.\n\nMetadata enrichment (human title, category) lands when the Kalshi scraper ships; for now only tickers + activity stats are surfaced.',
        tags: ['Kalshi Markets'],
        security: [{ bearerAuth: [] }],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': {
                        schema: resolver(responseSchema),
                        examples: {
                            top: {
                                value: {
                                    data: [
                                        {
                                            series: 'KXNBAGAME',
                                            market_count: 12,
                                            volume: 1433498.52,
                                            trades: 3104,
                                            buys: 2645,
                                            sells: 459,
                                            first_trade: '2026-05-01 00:00:00',
                                            last_trade: '2026-05-01 00:09:59',
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
