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
    evmAddress,
    polymarketConditionIdSchema,
    polymarketEventTypeSchema,
    polymarketTokenIdSchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './activity.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    user: { schema: evmAddress, optional: true },
    token_id: { schema: polymarketTokenIdSchema, optional: true },
    condition_id: { schema: polymarketConditionIdSchema, optional: true },
    event_type: { schema: polymarketEventTypeSchema, optional: true },
    start_time: { schema: timestampSchema, optional: true },
    end_time: { schema: timestampSchema, optional: true },
});

const marketContextSchema = z.object({
    condition_id: z.string().nullable(),
    market_slug: z.string().nullable(),
    token_id: z.string().nullable(),
    outcome_label: z.string().nullable(),
    closed: z.boolean(),
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            event_type: z.string(),
            timestamp: dateTimeSchema,
            block_num: z.number(),
            tx_hash: z.string(),
            user: z.string(),
            amount: z.string(),
            value: z.number(),
            fee_amount: z.string(),
            fee_value: z.number(),
            market: marketContextSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Market Activity',
        description:
            'Returns a chronological feed of on-chain trades, position splits, merges, and redemptions. Each row includes the transaction hash, block number, and scaled amounts.\n\nFor trades, `market.token_id` and `market.outcome_label` identify the specific outcome token. For splits, merges, and redemptions, these are null because the operation applies to the market as a whole.\n\nAt least one of `user`, `token_id`, or `condition_id` is required. Defaults to the last 24 hours when no time range is specified. Pass `start_time` and `end_time` to query older data.',
        tags: ['Polymarket Markets'],
        security: [{ bearerAuth: [] }],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': {
                        schema: resolver(responseSchema),
                        examples: {
                            recent_activity: {
                                value: {
                                    data: [
                                        {
                                            event_type: 'trade',
                                            timestamp: '2026-04-02 16:51:31',
                                            block_num: 85014327,
                                            tx_hash:
                                                '0xf190865afd395e2f4b8f2e5f8ceb2c05a86d94a73ea411e8a8a3fc649924c420',
                                            user: '0x38e598961dd0456a7fb2e758bd433d3e59fb8a4a',
                                            amount: '3976744',
                                            value: 3.98,
                                            fee_amount: '526315',
                                            fee_value: 0.53,
                                            market: {
                                                condition_id:
                                                    '0xcb37916b953e6b37a5be32ceabc5a093614be15d9e6abb7668bf6400fbf36d46',
                                                market_slug: 'bitcoin-up-or-down-on-april-3-2026',
                                                token_id:
                                                    '3861173442961229042274748637211736540847931193208187121747580704941582603312',
                                                outcome_label: 'Down',
                                                closed: false,
                                            },
                                        },
                                        {
                                            event_type: 'split',
                                            timestamp: '2026-04-02 16:54:27',
                                            block_num: 85014415,
                                            tx_hash:
                                                '0x144e86c0cd14880a6615dc1853e4438287efde3a9fb0ddca618a1b48d22d59bf',
                                            user: '0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e',
                                            amount: '680000',
                                            value: 0.68,
                                            fee_amount: '0',
                                            fee_value: 0,
                                            market: {
                                                condition_id:
                                                    '0xb03edede6288cd4e3af35e9aa2d8eeb1a8a0fcde8ba270cc2ae3677bd6dc44f0',
                                                market_slug: 'btc-updown-5m-1775148600',
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

    if (!params.user && !params.token_id && !params.condition_id) {
        return c.json(
            {
                status: 400,
                code: 'bad_query_input',
                message: 'Provide at least one of user, token_id, or condition_id',
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
