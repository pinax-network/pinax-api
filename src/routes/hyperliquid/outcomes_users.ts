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
    hyperliquidOutcomeIdSchema,
    hyperliquidOutcomeUserSortBySchema,
    hyperliquidQuestionIdSchema,
    userLookbackIntervalSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';
import { outcomeContextSchema } from './_outcome_context.js';

import query from './outcomes_users.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    user: { schema: evmAddressSchema, batched: true, optional: true },
    outcome_id: { schema: hyperliquidOutcomeIdSchema, batched: true, optional: true },
    question_id: { schema: hyperliquidQuestionIdSchema, batched: true, optional: true },
    interval: { schema: userLookbackIntervalSchema, optional: true },
    sort_by: { schema: hyperliquidOutcomeUserSortBySchema, prefault: 'total_volume' },
});

const SORT_COLUMN_MAP: Record<string, string> = {
    total_volume: 'total_volume',
    transactions: 'transactions',
    realized_pnl: 'realized_pnl',
};

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            user: z.string(),
            transactions: z.number().int(),
            buys: z.number().int(),
            sells: z.number().int(),
            volume_bought: z.number(),
            volume_sold: z.number(),
            total_volume: z.number(),
            realized_pnl: z.number(),
            first_trade: dateTimeSchema,
            last_trade: dateTimeSchema,
            outcome: outcomeContextSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Outcome User Lookup',
        description:
            '**At least one of `user`, `outcome_id`, or `question_id` is required** — calls without any of these return `400`.\n\nReturns trading aggregates per outcome with both side legs (Yes/No or custom labels) collapsed into one row per (user, outcome). Includes fill count, buys/sells split, volume bought/sold, realized PnL, and first/last trade times.\n\nFilters compose additively. Sorted by `sort_by` descending (default `total_volume`; also `transactions`, `realized_pnl`) — when `user` is omitted the response is a leaderboard for the given outcome / question scope.\n\nSETTLEMENT events contribute to `realized_pnl` (the resolution payout is realized P&L for positions held to resolution) but do not count toward `transactions` / `buys` / `sells` / `volume_*` — those reflect actual taker trade activity. SPLIT/MERGE/MERGE_QUESTION/NEGATE composition events are excluded from every aggregate.\n\n`interval` selects the lookback window applied at MV refresh time: `1h`, `1d`, `1w`, `30d`. Omit for all-time. Each interval is a sliding window of fills whose `fill_time >= now() - interval` at the most recent MV refresh; rows have up to one hour of staleness (and up to six hours for the all-time aggregate). Backed by `state_user_by_coin`.\n\nEvery row embeds the compact `outcome` context (`outcome_id`, `outcome_name`, `question_id`, `question_name`, `status`, `settle_fraction`). For full outcome metadata (description, side_specs, named_outcome_ids, etc.) call `/v1/hyperliquid/outcomes?outcome_id=...`.',
        tags: ['Hyperliquid Outcomes'],
        security: [{ bearerAuth: [] }],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': {
                        schema: resolver(responseSchema),
                        examples: {
                            single_user_profile: {
                                summary: '?user=0xfcec... — per-outcome stats for one user',
                                value: {
                                    data: [
                                        {
                                            user: '0xfcecc2a54724cf0502eb7c916e2717ef76a510ed',
                                            transactions: 276,
                                            buys: 30,
                                            sells: 246,
                                            volume_bought: 62980.97,
                                            volume_sold: 194043.55,
                                            total_volume: 257024.52,
                                            realized_pnl: 61796.11,
                                            first_trade: '2026-06-12 09:36:14',
                                            last_trade: '2026-06-14 18:15:01',
                                            outcome: {
                                                outcome_id: 318,
                                                outcome_name: 'Germany',
                                                question_id: null,
                                                question_name: null,
                                                status: 'settled',
                                                settle_fraction: 1.0,
                                            },
                                        },
                                    ],
                                },
                            },
                            leaderboard_by_outcome: {
                                summary: '?outcome_id=357 — top traders on one outcome, sorted by total_volume',
                                value: {
                                    data: [
                                        {
                                            user: '0xfcecc2a54724cf0502eb7c916e2717ef76a510ed',
                                            transactions: 207,
                                            buys: 55,
                                            sells: 152,
                                            volume_bought: 19590.55,
                                            volume_sold: 63301.03,
                                            total_volume: 82891.58,
                                            realized_pnl: 7524.9,
                                            first_trade: '2026-06-16 23:05:01',
                                            last_trade: '2026-06-17 20:10:33',
                                            outcome: {
                                                outcome_id: 357,
                                                outcome_name: 'Argentina',
                                                question_id: 32,
                                                question_name: '2026 World Cup Champion',
                                                status: 'live',
                                                settle_fraction: null,
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

    if (!params.user.length && !params.outcome_id.length && !params.question_id.length) {
        return c.json(
            {
                status: 400,
                code: 'bad_query_input',
                message: 'Provide at least one of user, outcome_id, or question_id',
            },
            400
        );
    }

    const hypercore = config.hypercoreDatabases.hyperliquid;
    if (!hypercore) {
        return c.json({ error: 'Hyperliquid not configured' }, 500);
    }

    const sortColumn = SORT_COLUMN_MAP[params.sort_by] ?? 'total_volume';
    const sql = query.replace('ORDER BY total_volume DESC', `ORDER BY ${sortColumn} DESC`);

    const response = await makeUsageQueryJson(c, [sql], {
        ...params,
        interval_min: params.interval ?? 0,
        network: 'hyperliquid',
        db_hypercore: hypercore.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
