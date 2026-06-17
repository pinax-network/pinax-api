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
    hyperliquidOutcomeCoinSchema,
    hyperliquidOutcomeDirectionSchema,
    hyperliquidOutcomeIdSchema,
    hyperliquidQuestionIdSchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';
import { outcomeLegContextSchema } from './_outcome_context.js';

import query from './outcomes_users_activity.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    user: { schema: evmAddressSchema, batched: true, optional: true },
    coin: { schema: hyperliquidOutcomeCoinSchema, batched: true, optional: true },
    outcome_id: { schema: hyperliquidOutcomeIdSchema, batched: true, optional: true },
    question_id: { schema: hyperliquidQuestionIdSchema, batched: true, optional: true },
    direction: { schema: hyperliquidOutcomeDirectionSchema, batched: true, optional: true },
    start_time: { schema: timestampSchema, optional: true },
    end_time: { schema: timestampSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            block_num: z.number().int(),
            timestamp: dateTimeSchema,
            transaction_hash: z.string(),
            event_index: z.number().int(),
            user: z.string(),
            side: z
                .string()
                .describe(
                    '`BID` = leg received shares, `ASK` = leg released shares. Composition events emit one row per leg they touch.'
                ),
            direction: z.string(),
            size: z.number(),
            closed_pnl: z.number().describe('Realized USDC delta on this leg-event row.'),
            outcome: outcomeLegContextSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Outcome User Activity',
        description:
            "Returns the chronological composition-event feed for HIP-4 outcome positions — one row per (event, affected leg). Covers `SETTLEMENT` (resolution payouts), `SPLIT_OUTCOME` (mint Yes+No from collateral), `MERGE_OUTCOME` (redeem Yes+No to collateral), `MERGE_QUESTION` (redeem the full Yes-set of a multi-outcome question), and `NEGATE_OUTCOME` (convert a No-A holding into Yes-on-every-other-outcome under the same question).\n\nBUY/SELL taker fills are deliberately excluded — query `/v1/hyperliquid/outcomes/trades` for those. Override the default by passing an explicit `direction` filter.\n\nFilters compose additively. At least one of `user`, `coin`, `outcome_id`, or `question_id` must be provided. Defaults to the last 24 hours when no time range is specified.\n\n`closed_pnl` carries the realized USDC delta for the row's leg (settlement payouts on the winning leg are positive; merge/redeem rows carry the collateral-side delta). For position-level rollups see `/v1/hyperliquid/outcomes/users`; for current open share balances see `/v1/hyperliquid/outcomes/users/positions`.\n\nEvery row embeds the compact `outcome` leg context (`outcome_id`, `outcome_name`, `question_id`, `question_name`, `status`, `settle_fraction`, `coin`, `side_index`, `side_label`). For full outcome metadata call `/v1/hyperliquid/outcomes?outcome_id=...`.",
        tags: ['Hyperliquid Outcomes'],
        security: [{ bearerAuth: [] }],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': {
                        schema: resolver(responseSchema),
                        examples: {
                            negate_event: {
                                summary: 'NEGATE_OUTCOME — 4 legs touched by one user action',
                                value: {
                                    data: [
                                        {
                                            block_num: 1037754379,
                                            timestamp: '2026-06-16 13:47:12',
                                            transaction_hash:
                                                '0xb31e3ae0c464cc5cb497043ddae00b020c9700c65f67eb2e56e6e6338368a647',
                                            event_index: 12,
                                            user: '0xfcecc2a54724cf0502eb7c916e2717ef76a510ed',
                                            side: 'BID',
                                            direction: 'NEGATE_OUTCOME',
                                            size: 26445,
                                            closed_pnl: 0,
                                            outcome: {
                                                outcome_id: 353,
                                                outcome_name: 'Brazil',
                                                question_id: 32,
                                                question_name: '2026 World Cup Champion',
                                                status: 'live',
                                                settle_fraction: null,
                                                coin: '#3530',
                                                side_index: 0,
                                                side_label: 'Yes',
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

const COMPOSITION_DIRECTIONS = ['SETTLEMENT', 'SPLIT_OUTCOME', 'MERGE_OUTCOME', 'MERGE_QUESTION', 'NEGATE_OUTCOME'];

const route = new Hono<{ Variables: { validatedData: z.infer<typeof querySchema> } }>();

route.get('/', openapi, zValidator('query', querySchema, validatorHook), validator('query', querySchema), async (c) => {
    const params = c.req.valid('query');

    if (!params.user.length && !params.coin.length && !params.outcome_id.length && !params.question_id.length) {
        return c.json(
            {
                status: 400,
                code: 'bad_query_input',
                message: 'Provide at least one of user, coin, outcome_id, or question_id',
            },
            400
        );
    }

    const hypercore = config.hypercoreDatabases.hyperliquid;
    if (!hypercore) {
        return c.json({ error: 'Hyperliquid not configured' }, 500);
    }

    // Default direction filter excludes BUY/SELL taker fills — those go through /outcomes/trades
    const direction = params.direction.length ? params.direction : COMPOSITION_DIRECTIONS;

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        direction,
        network: 'hyperliquid',
        db_hypercore: hypercore.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
