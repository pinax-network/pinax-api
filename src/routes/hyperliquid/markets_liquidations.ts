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
    hyperliquidLiquidationSortBySchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import baseQuery from './markets_liquidations.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    coin: { schema: hyperliquidCoinSchema, optional: true },
    dex: { schema: hyperliquidDexIdSchema, optional: true },
    liquidated_user: { schema: evmAddressSchema, optional: true },
    sort_by: { schema: hyperliquidLiquidationSortBySchema, prefault: 'notional' },
    start_time: { schema: timestampSchema, optional: true },
    end_time: { schema: timestampSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            timestamp: dateTimeSchema,
            coin: z.string(),
            dex: z.string(),
            liquidated_user: z.string(),
            event_hash: z.string(),
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
            "Returns one row per liquidation event, aggregated across the multiple fills that walk the book during a liquidation. Only the liquidated user's side is returned — counterparty fills are excluded.\n\nEach row surfaces the coin, liquidated user, transaction hash, liquidation kind (`CROSS_LONG`, `ISOLATED_SHORT`, and others), total size and notional, size-weighted average fill price, the mark price at liquidation, and the liquidation method reported by the venue (`backstop` and others).\n\nFilter by `coin`, `dex`, and/or `liquidated_user` — filters compose additively. Sort by `notional` (default — largest events first) or `time` (most recent first).",
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
                                            timestamp: '2026-04-08 23:00:40',
                                            coin: 'FARTCOIN',
                                            dex: 'perps',
                                            liquidated_user: '0xc6cda4ed388719a2d7c119d702ae2ef97c40c406',
                                            event_hash:
                                                '0xf9803227bf7df450faf90438b4d3870104004a0d5a7113239d48dd7a7e71ce3b',
                                            direction: 'LIQUIDATED_CROSS_LONG',
                                            liquidation_kind: 'CROSS_LONG',
                                            fills: 2,
                                            total_size: 59861909,
                                            notional: 12966688.11,
                                            avg_fill_price: 0.21661,
                                            mark_price: 0.21157,
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
