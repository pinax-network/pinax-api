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
    polymarketConditionIdSchema,
    polymarketMarketSortBySchema,
    polymarketSlugSchema,
    polymarketTokenIdSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import baseQuery from './markets.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    condition_id: { schema: polymarketConditionIdSchema, batched: true, optional: true },
    market_slug: { schema: polymarketSlugSchema, batched: true, optional: true },
    token_id: { schema: polymarketTokenIdSchema, batched: true, optional: true },
    event_slug: { schema: polymarketSlugSchema, batched: true, optional: true },
    closed: { schema: booleanFromString, optional: true },
    sort_by: { schema: polymarketMarketSortBySchema, prefault: 'volume' },
});

const outcomeSchema = z.object({
    label: z.string(),
    token_id: z.string(),
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            condition_id: z.string(),
            market_slug: z.string(),
            event_slug: z.string().nullable(),
            event_title: z.string().nullable(),
            question: z.string(),
            description: z.string(),
            outcomes: z.array(outcomeSchema),
            closed: z.boolean(),
            neg_risk: z.boolean(),
            accepting_orders: z.boolean(),
            fees_enabled: z.boolean(),
            volume: z.number(),
            start_date: z.string(),
            end_date: z.string(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Market Lookup',
        description:
            'Returns market metadata including question, outcomes with token IDs, volume, and status. Each market has exactly two outcomes (binary); multi-outcome scenarios are modeled as multiple markets grouped under one event.\n\nUse this to discover `token_id` values needed for OHLCV and position queries, or to resolve a slug to identifiers. When no identifier is provided, returns a paginated list for discovery.',
        tags: ['Polymarket Markets'],
        security: [],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': {
                        schema: resolver(responseSchema),
                        examples: {
                            by_slug: {
                                value: {
                                    data: [
                                        {
                                            condition_id:
                                                '0x6331a779482df72d904c3c1e12b6409ff836bc06f8c97945cba9b25ada2c605c',
                                            market_slug: 'will-the-portland-trail-blazers-win-the-2026-nba-finals',
                                            event_slug: '2026-nba-champion',
                                            event_title: '2026 NBA Champion',
                                            question: 'Will the Portland Trail Blazers win the 2026 NBA Finals?',
                                            description: '',
                                            outcomes: [
                                                {
                                                    label: 'Yes',
                                                    token_id:
                                                        '82402823484466457361170410951601106261368113664328436062375970009969959380598',
                                                },
                                                {
                                                    label: 'No',
                                                    token_id:
                                                        '48262548906086150698299934962091284390063927164151224719187427455086357699251',
                                                },
                                            ],
                                            closed: false,
                                            neg_risk: true,
                                            accepting_orders: true,
                                            fees_enabled: false,
                                            volume: 5483559.78,
                                            start_date: '2025-06-23T16:02:41.286933Z',
                                            end_date: '2026-07-01T00:00:00Z',
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

const SORT_COLUMN_MAP: Record<string, string> = {
    volume: 'm.volume_num',
    end_date: 'm.end_date',
    start_date: 'm.start_date',
};

const route = new Hono<{ Variables: { validatedData: z.infer<typeof querySchema> } }>();

route.get('/', openapi, zValidator('query', querySchema, validatorHook), validator('query', querySchema), async (c) => {
    const params = c.req.valid('query');

    const scraper = config.scraperDatabases.polymarket;
    if (!scraper) {
        return c.json({ error: 'Polymarket not configured' }, 500);
    }

    const sortColumn = SORT_COLUMN_MAP[params.sort_by] ?? 'm.volume_num';
    const fragments = [baseQuery.replace('ORDER BY m.volume_num DESC', `ORDER BY ${sortColumn} DESC`)];

    const response = await makeUsageQueryJson(c, fragments, {
        ...params,
        network: 'polymarket',
        db_scraper: scraper.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
