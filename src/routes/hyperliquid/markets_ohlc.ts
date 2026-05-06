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

import query from './markets_ohlc.sql' with { type: 'text' };

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
            buy_volume: z.number(),
            ask_volume: z.number(),
            gross_volume: z.number(),
            net_volume: z.number(),
            open_long_volume: z.number(),
            close_long_volume: z.number(),
            open_short_volume: z.number(),
            close_short_volume: z.number(),
            transactions: z.number().int(),
            buys: z.number().int(),
            sells: z.number().int(),
            unique_users: z.number().int(),
            total_fees: z.number(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Market OHLCV',
        description:
            'Returns OHLCV candles for a single coin and interval, derived from regular trade fills. Volume is broken down both by side (`buy_volume`, `ask_volume`) and — on perpetuals — by directional intent (`open_long_volume`, `close_long_volume`, `open_short_volume`, `close_short_volume`) so consumers can distinguish whether price moves are driven by fresh exposure or position unwinds. On spot markets the directional-intent fields are zero; the side-volume fields carry the buy/sell breakdown directly.\n\nFor liquidation-only candles (with mark-price OHLC), use `/v1/hyperliquid/markets/liquidations/ohlc`.',
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
                                            timestamp: '2026-04-30 23:00:00',
                                            coin: 'BTC',
                                            market_name: 'BTC',
                                            dex: 'perps',
                                            interval_min: 60,
                                            open: 76184,
                                            high: 76286,
                                            low: 76178,
                                            close: 76257,
                                            buy_volume: 10848062.98,
                                            ask_volume: 28447564.19,
                                            gross_volume: 39295627.17,
                                            net_volume: -17599501.21,
                                            open_long_volume: 4495886.85,
                                            close_long_volume: 11423420.07,
                                            open_short_volume: 13640171.56,
                                            close_short_volume: 5181222.62,
                                            transactions: 5544,
                                            buys: 2170,
                                            sells: 3374,
                                            unique_users: 1183,
                                            total_fees: 111.23,
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
