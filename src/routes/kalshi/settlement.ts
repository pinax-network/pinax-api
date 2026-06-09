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

import query from './settlement.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    ticker: { schema: kalshiTickerSchema, optional: true },
    series: { schema: kalshiSeriesSchema, optional: true },
    start_time: { schema: timestampSchema, optional: true },
    end_time: { schema: timestampSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            ticker: z.string(),
            series: z.string(),
            kind: z.string(),
            timestamp: dateTimeSchema,
            status: z.string(),
            result: z.string().nullable(),
            settlement_value: z.number().nullable(),
            mve_collection_ticker: z.string().nullable(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Market Settlement',
        description:
            'Canonical resolution records for Kalshi markets. One row per market lifecycle event (currently `market_settled`) carrying the authoritative `status`, `result` (`yes` / `no` / `null` for scalar), and `settlement_value` at resolution.\n\nFilter by `ticker`, `series`, or a time range.',
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
                                            ticker: 'KXDOGE15M-26APR302000-00',
                                            series: 'KXDOGE15M',
                                            kind: 'market_settled',
                                            timestamp: '2026-05-01 00:00:26',
                                            status: 'finalized',
                                            result: 'no',
                                            settlement_value: 0,
                                            mve_collection_ticker: null,
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
