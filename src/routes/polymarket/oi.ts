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
    evmIntervalSchema,
    polymarketConditionIdSchema,
    polymarketSlugSchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './oi.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    condition_id: { schema: polymarketConditionIdSchema, optional: true },
    market_slug: { schema: polymarketSlugSchema, optional: true },
    interval: { schema: evmIntervalSchema, prefault: '1d' },
    start_time: { schema: timestampSchema, optional: true },
    end_time: { schema: timestampSchema, optional: true },
});

const marketContextSchema = z.object({
    condition_id: z.string(),
    market_slug: z.string().nullable(),
    token_id: z.null(),
    outcome_label: z.null(),
    closed: z.boolean(),
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            timestamp: dateTimeSchema,
            net_open_interest: z.number(),
            split_amount: z.number(),
            merge_amount: z.number(),
            split_count: z.number(),
            merge_count: z.number(),
            transactions: z.number(),
            unique_stakeholders: z.number(),
            market: marketContextSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Market Open Interest',
        description:
            'Returns the open-interest time series for a market. Open interest is the USDC collateral locked into conditional token positions. It increases on splits (deposit USDC to mint Yes+No pairs) and decreases on merges (return pairs to withdraw USDC) or redemptions.\n\nProvide exactly one of `condition_id` or `market_slug`.',
        tags: ['Polymarket Markets'],
        security: [{ bearerAuth: [] }],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': {
                        schema: resolver(responseSchema),
                        examples: {
                            bitcoin_threshold: {
                                value: {
                                    data: [
                                        {
                                            timestamp: '2025-04-04 00:00:00',
                                            net_open_interest: 43835.62,
                                            split_amount: 292320.96,
                                            merge_amount: 248485.34,
                                            split_count: 989,
                                            merge_count: 172,
                                            transactions: 1161,
                                            unique_stakeholders: 14,
                                            market: {
                                                condition_id:
                                                    '0x39e227f0e4a6c0a7b282d77ae0e7d247d0cc4b8e69a348e853442bbd4db10f6a',
                                                market_slug: 'bitcoin-above-86000-on-april-4',
                                                token_id: null,
                                                outcome_label: null,
                                                closed: false,
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

    if (!params.condition_id && !params.market_slug) {
        return c.json(
            { status: 400, code: 'bad_query_input', message: 'Provide one of condition_id or market_slug' },
            400
        );
    }
    if (params.condition_id && params.market_slug) {
        return c.json(
            {
                status: 400,
                code: 'bad_query_input',
                message: 'Provide only one of condition_id or market_slug, not both',
            },
            400
        );
    }

    const db = config.polymarketDatabases.polymarket;
    const scraper = config.scraperDatabases.polymarket;
    if (!db || !scraper) {
        return c.json({ error: 'Polymarket not configured' }, 500);
    }

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        network: 'polymarket',
        db_polymarket: db.database,
        db_scraper: scraper.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
