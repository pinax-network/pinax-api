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
    hyperliquidOutcomeCoinSchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './outcomes_ohlc.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    coin: { schema: hyperliquidOutcomeCoinSchema },
    interval: { schema: evmIntervalSchema, prefault: '1h' },
    start_time: { schema: timestampSchema, optional: true },
    end_time: { schema: timestampSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            timestamp: dateTimeSchema,
            coin: z.string(),
            outcome_id: z.number().int(),
            side_index: z.number().int(),
            side_label: z.string(),
            outcome_name: z.string(),
            interval_min: z.number().int(),
            open: z.number(),
            high: z.number(),
            low: z.number(),
            close: z.number(),
            buy_volume: z.number(),
            sell_volume: z.number(),
            gross_volume: z.number(),
            net_volume: z.number(),
            transactions: z.number().int(),
            buys: z.number().int(),
            sells: z.number().int(),
            total_fees: z.number(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Outcome OHLCV',
        description:
            'Returns OHLCV candles for a single outcome leg (one Yes/No side) over the requested interval. Trade-side (`buy_volume`/`sell_volume`) carries the directional split — `buy_volume` counts taker buys of this leg, `sell_volume` counts taker sells. Composition events (SPLIT_OUTCOME, MERGE_OUTCOME, MERGE_QUESTION, NEGATE_OUTCOME) and SETTLEMENT payouts are excluded from candles by design — query them via `/v1/hyperliquid/outcomes/trades` for the raw stream.\n\n`total_fees` is currently always zero on outcomes — HL does not charge per-trade fees on HIP-4 markets. Field retained for forward-compat.',
        tags: ['Hyperliquid Outcomes'],
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
                                            timestamp: '2026-06-15 05:00:00',
                                            coin: '#3290',
                                            outcome_id: 329,
                                            side_index: 0,
                                            side_label: 'Yes',
                                            outcome_name: 'Recurring',
                                            interval_min: 60,
                                            open: 0.99999,
                                            high: 0.99999,
                                            low: 0.99999,
                                            close: 0.99999,
                                            buy_volume: 48008.52,
                                            sell_volume: 0,
                                            gross_volume: 48008.52,
                                            net_volume: 48008.52,
                                            transactions: 60,
                                            buys: 60,
                                            sells: 0,
                                            total_fees: 0,
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
