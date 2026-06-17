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
    hyperliquidQuestionIdSchema,
    userLookbackIntervalSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';
import { outcomeContextSchema } from './_outcome_context.js';

import query from './outcomes_users.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    user: { schema: evmAddressSchema, batched: true },
    outcome_id: { schema: hyperliquidOutcomeIdSchema, batched: true, optional: true },
    question_id: { schema: hyperliquidQuestionIdSchema, batched: true, optional: true },
    interval: { schema: userLookbackIntervalSchema, optional: true },
});

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
            'Returns trading aggregates per outcome for a given user, with both side legs (Yes/No or custom labels) collapsed into one row per outcome. Includes fill count, buys/sells split, volume bought/sold, realized PnL, and first/last trade times.\n\nSETTLEMENT events contribute to `realized_pnl` (the resolution payout is realized P&L for positions held to resolution) but do not count toward `transactions` / `buys` / `sells` / `volume_*` — those reflect actual taker trade activity. SPLIT/MERGE/MERGE_QUESTION/NEGATE composition events are excluded from every aggregate.\n\n`user` is required; `outcome_id` and `question_id` narrow further. Sorted by `total_volume` descending. Backed by `state_user_by_coin` (hourly refresh; `interval=1h` lags up to 1h).\n\nEvery row embeds the compact `outcome` context (`outcome_id`, `outcome_name`, `question_id`, `question_name`, `status`, `settle_fraction`). For full outcome metadata (description, side_specs, named_outcome_ids, etc.) call `/v1/hyperliquid/outcomes?outcome_id=...`.',
        tags: ['Hyperliquid Outcomes'],
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

    if (!params.user.length) {
        return c.json({ status: 400, code: 'bad_query_input', message: 'user is required' }, 400);
    }

    const hypercore = config.hypercoreDatabases.hyperliquid;
    if (!hypercore) {
        return c.json({ error: 'Hyperliquid not configured' }, 500);
    }

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        interval_min: params.interval ?? 0,
        network: 'hyperliquid',
        db_hypercore: hypercore.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
