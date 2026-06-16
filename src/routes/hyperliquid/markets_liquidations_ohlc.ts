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

import query from './markets_liquidations_ohlc.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    coin: { schema: hyperliquidCoinSchema },
    dex: { schema: hyperliquidDexIdSchema, optional: true },
    interval: { schema: evmIntervalSchema, prefault: '1d' },
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
            open: z.number(),
            high: z.number(),
            low: z.number(),
            close: z.number(),
            mark_price_open: z.number(),
            mark_price_high: z.number(),
            mark_price_low: z.number(),
            mark_price_close: z.number(),
            buy_volume: z.number(),
            sell_volume: z.number(),
            gross_volume: z.number(),
            net_volume: z.number(),
            open_long_volume: z.number(),
            close_long_volume: z.number(),
            open_short_volume: z.number(),
            close_short_volume: z.number(),
            transactions: z.number().int(),
            unique_liquidators: z.number().int(),
            unique_liquidated: z.number().int(),
            total_fees: z.number(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Market Liquidations OHLCV',
        description:
            'Returns liquidation-only OHLCV candles for a single coin and interval. Adds mark-price OHLC (`mark_price_open`, `mark_price_high`, `mark_price_low`, `mark_price_close`), the price feed used for margining at liquidation time, alongside the standard trade-price OHLC. Volume and counts cover the liquidation fills only.\n\nFor all-fill candles, use `/v1/hyperliquid/markets/ohlc`.',
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
                                            timestamp: '2026-04-30 19:00:00',
                                            coin: 'BTC',
                                            market_name: 'BTC',
                                            dex: 'perps',
                                            interval_min: 60,
                                            open: 76395,
                                            high: 76395,
                                            low: 76395,
                                            close: 76395,
                                            mark_price_open: 76390,
                                            mark_price_high: 76390,
                                            mark_price_low: 76390,
                                            mark_price_close: 76390,
                                            buy_volume: 16.81,
                                            sell_volume: 0,
                                            gross_volume: 16.81,
                                            net_volume: 16.81,
                                            open_long_volume: 0,
                                            close_long_volume: 0,
                                            open_short_volume: 16.81,
                                            close_short_volume: 0,
                                            transactions: 1,
                                            unique_liquidators: 1,
                                            unique_liquidated: 1,
                                            total_fees: -0.000336,
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
