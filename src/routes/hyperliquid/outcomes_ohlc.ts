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
    hyperliquidOutcomeIdSchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './outcomes_ohlc.sql' with { type: 'text' };

const sideValues = ['yes', 'no', 'both'] as const;
const sideSchema = z.enum(sideValues).meta({
    type: 'string',
    enum: sideValues,
    default: 'yes',
    description:
        '`yes` (default) returns candles for the side at `side_index=0`, `no` for `side_index=1`, `both` returns both legs interleaved. Only used in combination with `outcome_id`; ignored when `coin` is provided explicitly.',
});

const querySchema = createQuerySchema({
    coin: { schema: hyperliquidOutcomeCoinSchema, batched: true, optional: true },
    outcome_id: { schema: hyperliquidOutcomeIdSchema, batched: true, optional: true },
    side: { schema: sideSchema, prefault: 'yes' },
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
            total_fees: z.number(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Outcome OHLCV',
        description:
            "Returns OHLCV candles for one or more outcome legs over the requested interval. Provide either `coin` (full Hyperliquid coin identifier, e.g. `#1730`) or `outcome_id` (UInt64); both accept CSV for batched grid views. With `outcome_id`, the `side` selector resolves to side_index 0 (`yes`, default), 1 (`no`), or returns both (`both`).\n\nTrade-side fields (`buy_volume`, `sell_volume`) carry the directional split: `buy_volume` counts taker buys of this leg, `sell_volume` counts taker sells. Composition events (SPLIT_OUTCOME, MERGE_OUTCOME, MERGE_QUESTION, NEGATE_OUTCOME) and SETTLEMENT payouts are excluded from candles by design; query them via `/v1/hyperliquid/outcomes/trades` for the raw stream.\n\nWhen multiple legs are requested, each timestamp bucket is paginated as a unit — the response contains every requested leg's candle for the most recent `limit` distinct timestamps. `total_fees` is currently always zero on outcomes since Hyperliquid does not charge per-trade fees on HIP-4 markets. Field retained for forward compatibility.",
        tags: ['Hyperliquid Outcomes'],
        security: [{ bearerAuth: [] }],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': {
                        schema: resolver(responseSchema),
                        examples: {
                            single_leg: {
                                value: {
                                    data: [
                                        {
                                            timestamp: '2026-06-16 15:00:00',
                                            coin: '#1730',
                                            outcome_id: 173,
                                            side_index: 0,
                                            side_label: 'Yes',
                                            outcome_name: 'Argentina',
                                            interval_min: 60,
                                            open: 0.09562,
                                            high: 0.09732,
                                            low: 0.09525,
                                            close: 0.09688,
                                            buy_volume: 4521.32,
                                            sell_volume: 2814.71,
                                            gross_volume: 7336.03,
                                            net_volume: 1706.61,
                                            transactions: 18,
                                            total_fees: 0,
                                        },
                                    ],
                                },
                            },
                            both_legs: {
                                summary: 'outcome_id=173&side=both — Yes and No interleaved per timestamp',
                                value: {
                                    data: [
                                        {
                                            timestamp: '2026-06-16 15:00:00',
                                            coin: '#1730',
                                            outcome_id: 173,
                                            side_index: 0,
                                            side_label: 'Yes',
                                            outcome_name: 'Argentina',
                                            interval_min: 60,
                                            open: 0.09562,
                                            high: 0.09732,
                                            low: 0.09525,
                                            close: 0.09688,
                                            buy_volume: 4521.32,
                                            sell_volume: 2814.71,
                                            gross_volume: 7336.03,
                                            net_volume: 1706.61,
                                            transactions: 18,
                                            total_fees: 0,
                                        },
                                        {
                                            timestamp: '2026-06-16 15:00:00',
                                            coin: '#1731',
                                            outcome_id: 173,
                                            side_index: 1,
                                            side_label: 'No',
                                            outcome_name: 'Argentina',
                                            interval_min: 60,
                                            open: 0.90438,
                                            high: 0.90475,
                                            low: 0.90268,
                                            close: 0.90305,
                                            buy_volume: 1820.55,
                                            sell_volume: 3104.88,
                                            gross_volume: 4925.43,
                                            net_volume: -1284.33,
                                            transactions: 12,
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

    if (!params.coin.length && !params.outcome_id.length) {
        return c.json(
            { status: 400, code: 'bad_query_input', message: 'Provide at least one of coin or outcome_id' },
            400
        );
    }

    const resolvedCoins = new Set<string>(params.coin);
    for (const oid of params.outcome_id) {
        const base = BigInt(oid) * 10n;
        if (params.side === 'yes' || params.side === 'both') resolvedCoins.add(`#${base}`);
        if (params.side === 'no' || params.side === 'both') resolvedCoins.add(`#${base + 1n}`);
    }

    const hypercore = config.hypercoreDatabases.hyperliquid;
    if (!hypercore) {
        return c.json({ error: 'Hyperliquid not configured' }, 500);
    }

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        coin: [...resolvedCoins],
        network: 'hyperliquid',
        db_hypercore: hypercore.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
