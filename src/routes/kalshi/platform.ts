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
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './platform.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    interval: { schema: kalshiIntervalSchema, prefault: '1d' },
    start_time: { schema: timestampSchema, optional: true },
    end_time: { schema: timestampSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            timestamp: dateTimeSchema,
            volume: z.number(),
            mean: z.number().nullable(),
            trades: z.number(),
            buys: z.number(),
            sells: z.number(),
            unique_markets: z.number(),
            unique_series: z.number(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Platform Aggregates',
        description:
            'Platform-wide time-series across all Kalshi markets — total contract volume, trade count, breadth (distinct markets and series active in the bar).',
        tags: ['Kalshi Platform'],
        security: [{ bearerAuth: [] }],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': {
                        schema: resolver(responseSchema),
                        examples: {
                            daily: {
                                value: {
                                    data: [
                                        {
                                            timestamp: '2026-05-01 00:00:00',
                                            volume: 5901976.12,
                                            mean: 0.3509,
                                            trades: 29823,
                                            buys: 20128,
                                            sells: 9695,
                                            unique_markets: 4795,
                                            unique_series: 370,
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
