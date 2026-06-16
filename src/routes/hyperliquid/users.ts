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
    hyperliquidUserSortBySchema,
    userLookbackIntervalSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import byCoinQuery from './users.sql' with { type: 'text' };
import leaderboardQuery from './users_leaderboard.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    user: { schema: evmAddressSchema, batched: true, optional: true },
    interval: { schema: userLookbackIntervalSchema, optional: true },
    sort_by: { schema: hyperliquidUserSortBySchema, prefault: 'total_volume' },
    coin: { schema: hyperliquidCoinSchema, batched: true, optional: true },
    dex: { schema: hyperliquidDexIdSchema, batched: true, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            user: z.string(),
            coin: z.string().nullable(),
            dex: z.string().nullable(),
            interval: z.string().nullable(),
            transactions: z.number().int(),
            buys: z.number().int(),
            sells: z.number().int(),
            volume_bought: z.number(),
            volume_sold: z.number(),
            total_volume: z.number(),
            total_fees: z.number(),
            realized_pnl: z.number(),
            total_funding: z.number(),
            liquidation_fills: z.number().int(),
            coins_traded: z.number().int(),
            first_trade: dateTimeSchema,
            last_trade: dateTimeSchema,
        })
    ),
});

const SORT_COLUMN_MAP: Record<string, string> = {
    total_volume: 'total_volume',
    transactions: 'transactions',
    total_fees: 'total_fees',
    realized_pnl: 'realized_pnl',
    total_funding: 'total_funding',
    liquidation_fills: 'liquidation_fills',
};

const openapi = describeRoute(
    withErrorResponses({
        summary: 'User Lookup',
        description:
            'Returns trading aggregates per user: fill count, volume broken down by side, total fees (negative values represent net maker rebates), realized PnL, net funding paid or received, liquidation-fill count, distinct coins traded, and first/last trade timestamps.\n\nOmit `user` for leaderboard mode (a paginated list sorted by `sort_by`). Provide `user` for profile mode (a single row). Filters `coin` and `dex` compose additively; pass either or both to narrow the scope (`coin=BTC` for one market, `dex=xyz` for one venue, both together for redundancy). A mismatched combination (e.g. `coin=cash:TSLA&dex=xyz`) returns empty.\n\nAggregation windows are fixed via the `interval` parameter: `1h`, `1d`, `1w`, `30d`, or omit for all-time. Data is refreshed hourly, so `1h` lags up to 1h.\n\nVaults trade as normal accounts, so passing a vault address as `user` returns its trading performance. Pair with `/v1/hyperliquid/vaults` for depositor-side stats.',
        tags: ['Hyperliquid Users'],
        security: [{ bearerAuth: [] }],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': {
                        schema: resolver(responseSchema),
                        examples: {
                            leaderboard: {
                                summary: 'Leaderboard mode (no filter)',
                                value: {
                                    data: [
                                        {
                                            user: '0x3029df6146509f4bd9bc39d85dd01fc9e9639a2f',
                                            coin: null,
                                            dex: null,
                                            interval: null,
                                            transactions: 969,
                                            buys: 488,
                                            sells: 481,
                                            volume_bought: 102292.57,
                                            volume_sold: 107984.47,
                                            total_volume: 210277.03,
                                            total_fees: 11.88,
                                            realized_pnl: 153.34,
                                            total_funding: 0.14,
                                            liquidation_fills: 0,
                                            coins_traded: 6,
                                            first_trade: '2026-02-22 02:01:26',
                                            last_trade: '2026-04-30 05:39:27',
                                        },
                                    ],
                                },
                            },
                            filtered_by_coin: {
                                summary: 'Filtered by coin=BTC',
                                value: {
                                    data: [
                                        {
                                            user: '0x3029df6146509f4bd9bc39d85dd01fc9e9639a2f',
                                            coin: 'BTC',
                                            dex: null,
                                            interval: null,
                                            transactions: 412,
                                            buys: 208,
                                            sells: 204,
                                            volume_bought: 48173.21,
                                            volume_sold: 50624.09,
                                            total_volume: 98797.3,
                                            total_fees: 5.92,
                                            realized_pnl: 78.41,
                                            total_funding: 0.06,
                                            liquidation_fills: 0,
                                            coins_traded: 1,
                                            first_trade: '2026-02-22 02:01:26',
                                            last_trade: '2026-04-30 05:39:27',
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

    const sortColumn = SORT_COLUMN_MAP[params.sort_by] ?? 'total_volume';
    // state_user_leaderboard is pre-aggregated across coins/dexes and keyed by
    // (interval_min, user) — use it whenever the request doesn't scope to a
    // specific coin or dex. Falls back to state_user_by_coin FINAL otherwise.
    const usesLeaderboard = !params.coin.length && !params.dex.length;
    const baseSql = usesLeaderboard ? leaderboardQuery : byCoinQuery;
    const sql = baseSql.replace('ORDER BY total_volume DESC', `ORDER BY ${sortColumn} DESC`);

    const response = await makeUsageQueryJson(c, [sql], {
        ...params,
        interval_min: params.interval ?? 0,
        network: 'hyperliquid',
        db_hypercore: hypercore.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
