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
    hyperliquidOutcomeIdSchema,
    hyperliquidQuestionIdSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';
import { outcomeLegContextSchema } from './_outcome_context.js';

import query from './outcomes_users_positions.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    user: { schema: evmAddressSchema, batched: true, optional: true },
    coin: { schema: hyperliquidOutcomeCoinSchema, batched: true, optional: true },
    outcome_id: { schema: hyperliquidOutcomeIdSchema, batched: true, optional: true },
    question_id: { schema: hyperliquidQuestionIdSchema, batched: true, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            user: z.string(),
            share_balance: z.number().describe('Net shares currently held on this leg.'),
            last_fill_time: dateTimeSchema.describe('Timestamp of the most recent fill that touched this leg.'),
            last_block_num: z.number().int(),
            outcome: outcomeLegContextSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Outcome User Positions',
        description:
            "**At least one of `user`, `coin`, `outcome_id`, or `question_id` is required** — calls without any of these return `400`.\n\nReturns each user's current open share balance per outcome leg, derived from the full history of `outcome_fills`. HIP-4's `side` field encodes share-flow direction (BID = receive, ASK = release); the running sum across BUY/SELL/SETTLEMENT/SPLIT/MERGE/NEGATE composition events yields the user's current share count, in line with HL `spotClearinghouseState.balances[]`.\n\nFilters compose additively. When `user` is omitted the response is a holder list for the requested outcome / question / coin scope, sorted by share_balance descending.\n\nOnly currently-open long positions are returned (`share_balance > 0`). Settled outcomes naturally drop out via SETTLEMENT ASK fills that zero the running sum. Coverage caveat: a sink that has not been backfilled to a block predating the user's earliest activity will under-report by the shares acquired before the backfill horizon. Reconcile against HL `spotClearinghouseState` when authoritative numbers are required.\n\nEvery row embeds the compact `outcome` leg context (`outcome_id`, `outcome_name`, `question_id`, `question_name`, `status`, `settle_fraction`, `coin`, `side_index`, `side_label`). For full outcome metadata call `/v1/hyperliquid/outcomes?outcome_id=...`.",
        tags: ['Hyperliquid Outcomes'],
        security: [{ bearerAuth: [] }],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': {
                        schema: resolver(responseSchema),
                        examples: {
                            single_user_positions: {
                                summary: '?user=0xfcec... — all open legs the user holds',
                                value: {
                                    data: [
                                        {
                                            user: '0xfcecc2a54724cf0502eb7c916e2717ef76a510ed',
                                            share_balance: 59601,
                                            last_fill_time: '2026-06-17 14:00:35',
                                            last_block_num: 1039020363,
                                            outcome: {
                                                outcome_id: 357,
                                                outcome_name: 'Argentina',
                                                question_id: 32,
                                                question_name: '2026 World Cup Champion',
                                                status: 'live',
                                                settle_fraction: null,
                                                coin: '#3570',
                                                side_index: 0,
                                                side_label: 'Yes',
                                            },
                                        },
                                    ],
                                },
                            },
                            holders_by_outcome: {
                                summary: '?outcome_id=357 — top holders on one outcome leg',
                                value: {
                                    data: [
                                        {
                                            user: '0xfcecc2a54724cf0502eb7c916e2717ef76a510ed',
                                            share_balance: 59601,
                                            last_fill_time: '2026-06-17 14:00:35',
                                            last_block_num: 1039020363,
                                            outcome: {
                                                outcome_id: 357,
                                                outcome_name: 'Argentina',
                                                question_id: 32,
                                                question_name: '2026 World Cup Champion',
                                                status: 'live',
                                                settle_fraction: null,
                                                coin: '#3570',
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

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        network: 'hyperliquid',
        db_hypercore: hypercore.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
