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
    evmAddressSchema,
    hyperliquidCoinSchema,
    hyperliquidDexIdSchema,
    hyperliquidLiquidationDirectionSchema,
    hyperliquidLiquidationSortBySchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import baseQuery from './markets_liquidations.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    coin: { schema: hyperliquidCoinSchema, batched: true, optional: true },
    dex: { schema: hyperliquidDexIdSchema, batched: true, optional: true },
    liquidated_user: { schema: evmAddressSchema, batched: true, optional: true },
    direction: { schema: hyperliquidLiquidationDirectionSchema, batched: true, optional: true },
    sort_by: { schema: hyperliquidLiquidationSortBySchema, prefault: 'notional' },
    start_time: { schema: timestampSchema, optional: true },
    end_time: { schema: timestampSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            block_num: z.number().int(),
            timestamp: dateTimeSchema,
            event_hash: z.string(),
            coin: z.string(),
            market_name: z.string(),
            dex: z.string(),
            liquidated_user: z.string(),
            direction: z.string(),
            liquidation_kind: z.string(),
            fills: z.number().int(),
            total_size: z.number(),
            notional: z.number(),
            avg_fill_price: z.number(),
            mark_price: z.number(),
            liquidation_method: z.string(),
            total_fees: z.number(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Market Liquidations',
        description:
            "Returns one row per liquidation event, aggregated across the multiple fills that walk the book during a liquidation. Only the liquidated user's side is returned; counterparty fills are excluded.\n\nEach row surfaces the coin, liquidated user, transaction hash, liquidation kind (`CROSS_LONG`, `ISOLATED_SHORT`, and others), total size and notional, size-weighted average fill price, the mark price at liquidation, and the liquidation method reported by the venue (`backstop` and others).\n\nFilter by `coin`, `dex`, and/or `liquidated_user`. Filters compose additively. Sort by `notional` (default, largest events first) or `time` (most recent first).",
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
                                            block_num: 880714128,
                                            timestamp: '2026-02-06 00:19:53',
                                            event_hash:
                                                '0x37cd3a3ffeb5bee739460434c180bf000008522599b8ddb9db95e592bdb998d1',
                                            coin: 'BTC',
                                            market_name: 'BTC',
                                            dex: 'perps',
                                            liquidated_user: '0x7ba283114573bde6fd304ad7b188a763e5402a52',
                                            direction: 'LIQUIDATED_CROSS_LONG',
                                            liquidation_kind: 'CROSS_LONG',
                                            fills: 2,
                                            total_size: 0.2203,
                                            notional: 13116.86,
                                            avg_fill_price: 59540.9,
                                            mark_price: 60114,
                                            liquidation_method: 'backstop',
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

    const orderClause =
        params.sort_by === 'time' ? 'ORDER BY timestamp DESC, event_hash DESC' : 'ORDER BY notional DESC';
    const sql = baseQuery.replace('ORDER BY notional DESC', orderClause);

    const response = await makeUsageQueryJson(c, [sql], {
        ...params,
        network: 'hyperliquid',
        db_hypercore: hypercore.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
