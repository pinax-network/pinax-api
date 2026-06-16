import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import {
    apiUsageResponseSchema,
    booleanFromString,
    createQuerySchema,
    polymarketMarketPositionSortBySchema,
    polymarketTokenIdSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import baseQuery from './market_positions.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    token_id: { schema: polymarketTokenIdSchema },
    closed: { schema: booleanFromString, optional: true },
    sort_by: { schema: polymarketMarketPositionSortBySchema, prefault: 'position_value' },
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
            user: z.string(),
            buy_cost: z.number(),
            sell_revenue: z.number(),
            realized_pnl: z.number(),
            unrealized_pnl: z.number(),
            total_pnl: z.number(),
            pnl_pct: z.number(),
            net_position: z.number(),
            avg_price: z.number(),
            current_price: z.number(),
            position_value: z.number(),
            active: z.boolean(),
            buys: z.number(),
            sells: z.number(),
            transactions: z.number(),
            market: marketContextSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Market Positions',
        description:
            "Returns all user positions for a specific outcome token, as a leaderboard view. Each row is one user's cumulative position: cost basis, PNL, shares held, and current value.\n\nFor a user's portfolio across all markets, use `/v1/polymarket/positions` instead.",
        tags: ['Polymarket Markets'],
        security: [{ bearerAuth: [] }],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': {
                        schema: resolver(responseSchema),
                        examples: {
                            top_holders: {
                                value: {
                                    data: [
                                        {
                                            user: '0xe8dd7741ccb12350957ec71e9ee332e0d1e6ec86',
                                            buy_cost: 235027.61,
                                            sell_revenue: 0,
                                            realized_pnl: -235027.61,
                                            unrealized_pnl: 235202.69,
                                            total_pnl: 175.08,
                                            pnl_pct: -1,
                                            net_position: 235910.42,
                                            avg_price: 0.996,
                                            current_price: 0.997,
                                            position_value: 235202.69,
                                            active: true,
                                            buys: 4573,
                                            sells: 0,
                                            transactions: 4573,
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

    const fragments = [baseQuery];
    if (params.closed === true) fragments.push('HAVING a.closed = 1');
    else if (params.closed === false) fragments.push('HAVING a.closed = 0');
    fragments.push(`ORDER BY ${params.sort_by} DESC LIMIT {limit:UInt64} OFFSET {offset:UInt64}`);

    const response = await makeUsageQueryJson(c, fragments, {
        ...params,
        network: 'polymarket',
        db_polymarket: db.database,
        db_scraper: scraper.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
