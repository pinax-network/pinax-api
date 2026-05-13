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
    hyperliquidCoinSchema,
    hyperliquidDexIdSchema,
    hyperliquidTokenSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import baseQuery from './markets.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    coin: { schema: hyperliquidCoinSchema, batched: true, optional: true },
    dex: { schema: hyperliquidDexIdSchema, batched: true, optional: true },
    base_token: { schema: hyperliquidTokenSchema, batched: true, optional: true },
    quote_token: { schema: hyperliquidTokenSchema, batched: true, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            coin: z.string(),
            market_name: z.string(),
            dex: z.string(),
            base_token: z.string().nullable(),
            quote_token: z.string().nullable(),
            price: z.number(),
            price_24h: z.number().nullable(),
            price_24h_change: z.number(),
            volume_24h: z.number(),
            buy_volume_24h: z.number(),
            sell_volume_24h: z.number(),
            trades_24h: z.number().int(),
            unique_users_24h: z.number().int(),
            open_interest: z.number().nullable(),
            funding_rate: z.number().nullable(),
            funding_snapshot_time: dateTimeSchema.nullable(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Market Lookup',
        description:
            'Returns the latest snapshot per market: last trade price, 24h change versus the prior-day close, 24h volume (split by side), trade and unique-user counts, and the most recent open interest and funding rate observed at the last funding snapshot.\n\nFilters compose additively — pass `coin`, `dex`, `base_token`, and/or `quote_token` to narrow the scope. A mismatched combination (e.g. `coin=cash:TSLA&dex=xyz`) returns empty. Omit all for a full listing sorted by 24h volume.\n\n`base_token` and `quote_token` are spot-discovery filters: `?base_token=HYPE` returns every spot pair where HYPE sits on the base side (HYPE/USDC, HYPE/USDT0, …). Use the `coin` from the result as the identifier on the rest of the `/v1/hyperliquid/*` endpoints.',
        tags: ['Hyperliquid Markets'],
        security: [],
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
                                            coin: 'BTC',
                                            market_name: 'BTC',
                                            dex: 'perps',
                                            base_token: null,
                                            quote_token: null,
                                            price: 75944,
                                            price_24h: 76765,
                                            price_24h_change: -0.010695,
                                            volume_24h: 2322418448.58,
                                            buy_volume_24h: 1106113114.59,
                                            sell_volume_24h: 1216305333.99,
                                            trades_24h: 454294,
                                            unique_users_24h: 4581,
                                            open_interest: 27608.56,
                                            funding_rate: 0.0000037749,
                                            funding_snapshot_time: '2026-04-28 15:00:00',
                                        },
                                        {
                                            coin: '@107',
                                            market_name: 'HYPE/USDC',
                                            dex: 'spot',
                                            base_token: 'HYPE',
                                            quote_token: 'USDC',
                                            price: 22.41,
                                            price_24h: 22.85,
                                            price_24h_change: -0.01926,
                                            volume_24h: 18452113.47,
                                            buy_volume_24h: 9071010.97,
                                            sell_volume_24h: 9381102.5,
                                            trades_24h: 28412,
                                            unique_users_24h: 1267,
                                            open_interest: null,
                                            funding_rate: null,
                                            funding_snapshot_time: null,
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

    const response = await makeUsageQueryJson(c, [baseQuery], {
        ...params,
        network: 'hyperliquid',
        db_hypercore: hypercore.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
