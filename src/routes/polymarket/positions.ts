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
    evmAddress,
    polymarketConditionIdSchema,
    polymarketPositionSortBySchema,
    polymarketSlugSchema,
    polymarketTokenIdSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import baseQuery from './positions.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    user: { schema: evmAddress, batched: true },
    token_id: { schema: polymarketTokenIdSchema, batched: true, optional: true },
    condition_id: { schema: polymarketConditionIdSchema, batched: true, optional: true },
    market_slug: { schema: polymarketSlugSchema, batched: true, optional: true },
    closed: { schema: booleanFromString, optional: true },
    sort_by: { schema: polymarketPositionSortBySchema, prefault: 'position_value' },
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
        summary: 'User Positions',
        description:
            "Returns a user's positions with PNL breakdown per outcome token. Each row is one token's cumulative position: cost basis, realized PNL, net shares held, average entry price, and current market price.\n\nUse `closed=false` for positions on live markets, or `closed=true` for resolved markets.",
        tags: ['Polymarket Users'],
        security: [{ bearerAuth: [] }],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': {
                        schema: resolver(responseSchema),
                        examples: {
                            user_positions: {
                                value: {
                                    data: [
                                        {
                                            user: '0x38e598961dd0456a7fb2e758bd433d3e59fb8a4a',
                                            buy_cost: 6438.35,
                                            sell_revenue: 247.09,
                                            realized_pnl: -6191.26,
                                            unrealized_pnl: 9005.64,
                                            total_pnl: 2814.38,
                                            pnl_pct: -0.96,
                                            net_position: 9096.61,
                                            avg_price: 0.68,
                                            current_price: 0.99,
                                            position_value: 9005.64,
                                            active: true,
                                            buys: 693,
                                            sells: 20,
                                            transactions: 713,
                                            market: {
                                                condition_id:
                                                    '0x59feadddd58e7821c086ee9f3dc4f544514b94ebd0e8d645a3c4d80ebdd354a2',
                                                market_slug: 'btc-updown-5m-1771359600',
                                                token_id:
                                                    '25362470215305294361999917933416973453076214567033270695579745712197481070383',
                                                outcome_label: 'Up',
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
