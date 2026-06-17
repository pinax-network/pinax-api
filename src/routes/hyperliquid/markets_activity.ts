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
    hyperliquidMarketDirectionSchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './markets_activity.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    coin: { schema: hyperliquidCoinSchema, batched: true, optional: true },
    dex: { schema: hyperliquidDexIdSchema, batched: true, optional: true },
    user: { schema: evmAddressSchema, batched: true, optional: true },
    direction: { schema: hyperliquidMarketDirectionSchema, batched: true, optional: true },
    start_time: { schema: timestampSchema, optional: true },
    end_time: { schema: timestampSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            block_num: z.number().int(),
            timestamp: dateTimeSchema,
            transaction_hash: z.string(),
            transaction_id: z.number().int(),
            coin: z.string(),
            market_name: z.string(),
            dex: z.string(),
            user: z.string(),
            side: z.string(),
            direction: z.string(),
            price: z.number(),
            size: z.number(),
            notional: z.number(),
            start_position: z.string(),
            closed_pnl: z.number(),
            fee: z.number(),
            fee_token: z.string(),
            order_id: z.number().int(),
            client_order_id: z.string(),
            twap_id: z.number().int(),
            crossed: z.boolean(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Market Activity',
        description:
            'Returns a chronological fill feed, filterable by `coin`, `dex`, and/or `user`. Each row is a single fill carrying price, size, side (`BID` or `ASK`), directional intent (`OPEN_LONG`, `CLOSE_SHORT`, `LIQUIDATED_CROSS_LONG`, `AUTO_DELEVERAGING`, and others), closed PnL, fees (negative values represent maker rebates), and order-level metadata (`order_id`, `client_order_id`, `twap_id`, `crossed`).\n\nFor balance-changing events on a user (deposits, withdrawals, funding payments, vault flows), use `/v1/hyperliquid/users/activity`.\n\nAt least one of `coin`, `dex`, or `user` is required. Filters compose additively; pass any combination to narrow further. A mismatched pair (e.g. `coin=cash:TSLA&dex=xyz`) returns empty.\n\nDefaults to the last 24 hours when no time range is specified. Pass `start_time` and `end_time` to query older data.',
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
                                            block_num: 979136485,
                                            timestamp: '2026-04-30 23:26:59',
                                            transaction_hash:
                                                '0x0000000000000000000000000000000000000000000000000000000000000000',
                                            transaction_id: 494766926007210,
                                            coin: 'BTC',
                                            market_name: 'BTC',
                                            dex: 'perps',
                                            user: '0xd8592afc09c864df215d8012122aed08e4ae453f',
                                            side: 'ASK',
                                            direction: 'OPEN_SHORT',
                                            price: 76257,
                                            size: 0.01424,
                                            notional: 1085.9,
                                            start_position: '-0.60385',
                                            closed_pnl: 0,
                                            fee: 0.380064,
                                            fee_token: 'USDC',
                                            order_id: 405525134401,
                                            client_order_id: '',
                                            twap_id: 1781070,
                                            crossed: true,
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

    if (!params.coin.length && !params.dex.length && !params.user.length) {
        return c.json(
            { status: 400, code: 'bad_query_input', message: 'Provide at least one of coin, dex, or user' },
            400
        );
    }

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
