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
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './outcomes_trades.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    coin: { schema: hyperliquidOutcomeCoinSchema, batched: true, optional: true },
    outcome_id: { schema: hyperliquidOutcomeIdSchema, batched: true, optional: true },
    question_id: { schema: hyperliquidQuestionIdSchema, batched: true, optional: true },
    user: { schema: evmAddressSchema, batched: true, optional: true },
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
            event_index: z.number().int(),
            coin: z.string(),
            outcome_id: z.number().int(),
            side_index: z.number().int(),
            side_label: z.string(),
            outcome_name: z.string(),
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
        summary: 'Outcome Trades',
        description:
            'Returns a chronological fill feed for HIP-4 outcome markets. Each row is a single fill carrying price, size, side (`BID` = user bought, `ASK` = user sold), and one of seven directions:\n\n- `BUY`, `SELL`: regular taker matches. These are the only directions that flow into OHLCV candles.\n- `SETTLEMENT`: payout when the outcome resolved. Size = position cleared, price = 1 on the winning leg or 0 on the losing leg.\n- `SPLIT_OUTCOME`: user minted both Yes+No legs by depositing $1 of the quote token.\n- `MERGE_OUTCOME`: user redeemed Yes+No legs back to $1 of the quote token.\n- `MERGE_QUESTION`: user redeemed a full set of question outcomes back to $1 (multi-outcome only).\n- `NEGATE_OUTCOME`: converted a Yes-leg holding into a No-leg holding for the *other* outcomes under the same question (multi-outcome only).\n\nFilters compose additively. At least one of `coin`, `outcome_id`, `question_id`, or `user` is required. Defaults to the last 24 hours when no time range is specified.\n\nFor candle aggregates of the BUY/SELL subset, see `/v1/hyperliquid/outcomes/ohlc`. `fee_token` shows `+<coin_number>` on zero-fee fills (Hyperliquid wire-format quirk).',
        tags: ['Hyperliquid Outcomes'],
        security: [{ bearerAuth: [] }],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': {
                        schema: resolver(responseSchema),
                        examples: {
                            settlement: {
                                value: {
                                    data: [
                                        {
                                            block_num: 1036093214,
                                            timestamp: '2026-06-15 06:00:23',
                                            transaction_hash:
                                                '0x40163a5290e2756e418f043dc1871e00005152382be59440e3dee5a54fe64f58',
                                            transaction_id: 218233422822675,
                                            event_index: 347,
                                            coin: '#3290',
                                            outcome_id: 329,
                                            side_index: 0,
                                            side_label: 'Yes',
                                            outcome_name: 'Recurring',
                                            user: '0xfc0a9d73b4382348bac7f4f600439bc61bb00271',
                                            side: 'ASK',
                                            direction: 'SETTLEMENT',
                                            price: 1,
                                            size: 428,
                                            notional: 428,
                                            start_position: '428.0',
                                            closed_pnl: 75.00065,
                                            fee: 0,
                                            fee_token: 'USDC',
                                            order_id: 469409912004,
                                            client_order_id: '',
                                            twap_id: 0,
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

    if (!params.coin.length && !params.outcome_id.length && !params.question_id.length && !params.user.length) {
        return c.json(
            {
                status: 400,
                code: 'bad_query_input',
                message: 'Provide at least one of coin, outcome_id, question_id, or user',
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
