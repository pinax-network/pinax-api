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
    polymarketTokenIdSchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './ohlcv.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    token_id: { schema: polymarketTokenIdSchema },
    interval: { schema: evmIntervalSchema, prefault: '1d' },
    start_time: { schema: timestampSchema, optional: true },
    end_time: { schema: timestampSchema, optional: true },
});

const marketContextSchema = z.object({
    condition_id: z.string().nullable(),
    market_slug: z.string().nullable(),
    token_id: z.string(),
    outcome_label: z.string().nullable(),
    closed: z.boolean(),
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            timestamp: dateTimeSchema,
            open: z.number(),
            high: z.number(),
            low: z.number(),
            close: z.number(),
            volume: z.number(),
            trades: z.number(),
            buys: z.number(),
            sells: z.number(),
            unique_makers: z.number(),
            unique_takers: z.number(),
            total_fees: z.number(),
            total_refunds: z.number(),
            net_fees: z.number(),
            fee_count: z.number(),
            effective_fee_rate_gross: z.number(),
            effective_fee_rate: z.number(),
            market: marketContextSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Market OHLCV',
        description:
            'Returns OHLCV price candles for a single outcome token. Each market has two outcome tokens (e.g. Yes and No); use `/v1/polymarket/markets` to discover them.\n\nPrices are in USD per share (0 to 1). Volume and fees are in USDC.',
        tags: ['Polymarket Markets'],
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
                                            timestamp: '2026-04-01 00:00:00',
                                            open: 0.997,
                                            high: 0.998,
                                            low: 0.997,
                                            close: 0.998,
                                            volume: 295143.37,
                                            trades: 1206,
                                            buys: 498,
                                            sells: 708,
                                            unique_makers: 592,
                                            unique_takers: 121,
                                            total_fees: 0,
                                            total_refunds: 0,
                                            net_fees: 0,
                                            fee_count: 0,
                                            effective_fee_rate_gross: 0,
                                            effective_fee_rate: 0,
                                            market: {
                                                condition_id:
                                                    '0x6331a779482df72d904c3c1e12b6409ff836bc06f8c97945cba9b25ada2c605c',
                                                market_slug: 'will-the-portland-trail-blazers-win-the-2026-nba-finals',
                                                token_id:
                                                    '48262548906086150698299934962091284390063927164151224719187427455086357699251',
                                                outcome_label: 'No',
                                                closed: false,
                                            },
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
    const scraper = config.scraperDatabases.polymarket;
    if (!db || !scraper) {
        return c.json({ error: 'Polymarket not configured' }, 500);
    }

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        network: 'polymarket',
        db_polymarket: db.database,
        db_scraper: scraper.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
