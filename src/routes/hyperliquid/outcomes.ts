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

const querySchema = createQuerySchema({
    outcome_id: { schema: hyperliquidOutcomeIdSchema, batched: true, optional: true },
    question_id: { schema: hyperliquidQuestionIdSchema, batched: true, optional: true },
    status: { schema: hyperliquidOutcomeStatusSchema, prefault: 'live' },
    quote_token: { schema: quoteTokenSchema, optional: true },
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
            name: z.string(),
            description: z.string(),
            side_specs: z.array(z.string()),
            status: z.string(),
            quote_token: z.string(),
            settle_fraction: z.number().nullable(),
            settle_details: z.string().nullable(),
            sides: z.array(sideSchema),
            price_yes: z.number().nullable(),
            volume_24h: z.number(),
            trades_24h: z.number().int(),
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
                                            outcome_id: 172,
                                            name: 'Argentina',
                                            description:
                                                'This outcome resolves to Yes if Argentina is officially declared the 2026 FIFA World Cup champion.',
                                            side_specs: ['Yes', 'No'],
                                            status: 'live',
                                            quote_token: 'USDC',
                                            settle_fraction: null,
                                            settle_details: null,
                                            sides: [
                                                { label: 'Yes', coin: '#1720', side_index: 0 },
                                                { label: 'No', coin: '#1721', side_index: 1 },
                                            ],
                                            price_yes: 0.012,
                                            volume_24h: 4521.32,
                                            trades_24h: 18,
                                            last_trade: '2026-06-12 13:38:55',
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
