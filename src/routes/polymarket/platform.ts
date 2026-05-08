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
            volume: z.number(),
            buy_volume: z.number(),
            sell_volume: z.number(),
            trades: z.number(),
            buys: z.number(),
            sells: z.number(),
            net_open_interest: z.number(),
            split_amount: z.number(),
            merge_amount: z.number(),
            split_count: z.number(),
            merge_count: z.number(),
            oi_transactions: z.number(),
            total_fees: z.number(),
            total_refunds: z.number(),
            net_fees: z.number(),
            fee_count: z.number(),
            effective_fee_rate_gross: z.number(),
            effective_fee_rate: z.number(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Platform Aggregates',
        description:
            'Returns platform-wide time-series combining trading volume, open interest, and fee aggregates across all Polymarket markets.',
        tags: ['Polymarket Platform'],
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
                                            timestamp: '2026-04-15 00:00:00',
                                            volume: 148067185.09,
                                            buy_volume: 39470527.47,
                                            sell_volume: 108596657.62,
                                            trades: 3065040,
                                            buys: 638547,
                                            sells: 2426493,
                                            net_open_interest: 161012348.11,
                                            split_amount: 222905687.23,
                                            merge_amount: 61893339.12,
                                            split_count: 4045998,
                                            merge_count: 338837,
                                            oi_transactions: 4384835,
                                            total_fees: 20602487.78,
                                            total_refunds: 17060492.91,
                                            net_fees: 3541994.86,
                                            fee_count: 7360794,
                                            effective_fee_rate_gross: 0.139,
                                            effective_fee_rate: 0.024,
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

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        network: 'polymarket',
        db_polymarket: db.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
