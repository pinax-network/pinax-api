import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import {
    apiUsageResponseSchema,
    booleanFromString,
    createQuerySchema,
    dateTimeSchema,
    hyperliquidOutcomeIdSchema,
    hyperliquidOutcomeStatusSchema,
    hyperliquidQuestionIdSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import baseQuery from './outcomes.sql' with { type: 'text' };

const outcomesSortFields = ['volume_24h', 'last_trade', 'outcome_id'] as const;
const outcomesSortBySchema = z.enum(outcomesSortFields).meta({
    type: 'string',
    enum: outcomesSortFields,
    default: 'volume_24h',
    description:
        '`volume_24h` (default) sorts by combined Yes+No leg volume in last 24h, ties broken by `outcome_id`. `last_trade` sorts by recency. `outcome_id` sorts numerically ascending.',
});

const quoteTokenSchema = z
    .string()
    .min(1)
    .refine((val) => !/[,\s]/.test(val), 'Invalid quote token (no commas or whitespace)')
    .meta({
        type: 'string',
        description: 'Quote token for the outcome market (e.g. `USDC`, `USDH`).',
        example: 'USDC',
    });

const includeFallbackSchema = booleanFromString.meta({
    description:
        'When `true`, include each multi-outcome question\'s fallback row (the catch-all "none of the above" leg). Defaults to `false` so list responses match the named outcomes a UI would render.',
});

const querySchema = createQuerySchema({
    outcome_id: { schema: hyperliquidOutcomeIdSchema, batched: true, optional: true },
    question_id: { schema: hyperliquidQuestionIdSchema, batched: true, optional: true },
    status: { schema: hyperliquidOutcomeStatusSchema, prefault: 'live' },
    quote_token: { schema: quoteTokenSchema, optional: true },
    include_fallback: { schema: includeFallbackSchema, default: false },
    sort_by: { schema: outcomesSortBySchema, prefault: 'volume_24h' },
});

const sideSchema = z.object({
    label: z.string(),
    coin: z.string(),
    side_index: z.number().int(),
});

const questionSchema = z.object({
    question_id: z.number().int().nullable(),
    name: z.string().nullable(),
    description: z.string().nullable(),
    fallback_outcome_id: z.number().int().nullable(),
    named_outcome_ids: z.array(z.number().int()),
    settled_outcome_ids: z.array(z.number().int()),
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            outcome_id: z.number().int(),
            name: z
                .string()
                .describe(
                    'Outcome leaf name. For multi-outcome questions this is the per-leg label (team, candidate, bucket). For binary single-outcome markets (`question.question_id IS NULL`) this is the full market title.'
                ),
            description: z.string(),
            side_specs: z.array(z.string()),
            status: z.string(),
            quote_token: z.string(),
            settle_fraction: z.number().nullable(),
            settle_details: z.string().nullable(),
            sides: z.array(sideSchema),
            price_yes: z
                .number()
                .nullable()
                .describe(
                    'Last traded price on the Yes leg (side_index=0) within the last 24h. Independent of `price_no`; sum across legs reflects market overround, not a normalized probability. Null when the Yes leg has no activity in the window even if the No leg traded — read `price_no` for the No-leg quote.'
                ),
            price_no: z
                .number()
                .nullable()
                .describe(
                    'Last traded price on the No leg (side_index=1) within the last 24h. Independent of `price_yes`. Null when the No leg has no activity in the window.'
                ),
            price_yes_24h: z
                .number()
                .nullable()
                .describe(
                    'Close on the Yes leg from 24–48h ago (matches `/v1/hyperliquid/markets`' +
                        ' `price_24h` convention). Null when no trades occurred in that window.'
                ),
            price_no_24h: z
                .number()
                .nullable()
                .describe('Close on the No leg from 24–48h ago. Null when no trades occurred in that window.'),
            price_yes_24h_change: z
                .number()
                .nullable()
                .describe(
                    'Decimal price change on the Yes leg over the last 24h, computed as `(price_yes - price_yes_24h) / price_yes_24h`. Null when either anchor is missing.'
                ),
            price_no_24h_change: z
                .number()
                .nullable()
                .describe('Decimal price change on the No leg over the last 24h. Null when either anchor is missing.'),
            volume_24h: z
                .number()
                .describe(
                    'Combined Yes+No leg taker notional over the last 24h, denominated in the outcome `quote_token`. Direction is signalled via `price_yes_24h_change` / `price_no_24h_change`, mirroring the convention used by Polymarket and Kalshi.'
                ),
            trades_24h: z.number().int().describe('Number of BUY/SELL taker fills across both legs in the last 24h.'),
            last_trade: dateTimeSchema.nullable(),
            question: questionSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Outcomes Lookup',
        description:
            'Returns HIP-4 outcome markets with metadata and 24h trading rollup. Each outcome trades as two side coins (Yes/No or custom labels) under one collateralized market.\n\nFilter with `outcome_id` for direct lookup, `question_id` to walk a multi-outcome question, or `status` to scope to live or settled outcomes. `question.question_id IS NULL` indicates a binary single-outcome market (no parent question grouping in HL `outcomeMeta`).\n\nThe two side coins are exposed in `sides[]`; use them with `/v1/hyperliquid/outcomes/ohlc` (per-leg) and `/v1/hyperliquid/outcomes/trades` (per-leg fills). Trade-shaped endpoints like `/v1/hyperliquid/markets/*` reject outcome coins.',
        tags: ['Hyperliquid Outcomes'],
        security: [{ bearerAuth: [] }],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': {
                        schema: resolver(responseSchema),
                        examples: {
                            multi_outcome: {
                                value: {
                                    data: [
                                        {
                                            outcome_id: 173,
                                            name: 'Argentina',
                                            description:
                                                'This outcome resolves to Yes if Argentina is officially declared the 2026 FIFA World Cup champion.',
                                            side_specs: ['Yes', 'No'],
                                            status: 'live',
                                            quote_token: 'USDC',
                                            settle_fraction: null,
                                            settle_details: null,
                                            sides: [
                                                { label: 'Yes', coin: '#1730', side_index: 0 },
                                                { label: 'No', coin: '#1731', side_index: 1 },
                                            ],
                                            price_yes: 0.09604,
                                            price_no: 0.90313,
                                            price_yes_24h: 0.09425,
                                            price_no_24h: 0.90575,
                                            price_yes_24h_change: 0.018992,
                                            price_no_24h_change: -0.002893,
                                            volume_24h: 82430.17,
                                            trades_24h: 93,
                                            last_trade: '2026-06-16 15:50:51',
                                            question: {
                                                question_id: 32,
                                                name: '2026 World Cup Champion',
                                                description:
                                                    'Each associated outcome corresponds to a team confirmed to be participating ...',
                                                fallback_outcome_id: 171,
                                                named_outcome_ids: [172, 173, 174],
                                                settled_outcome_ids: [],
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
