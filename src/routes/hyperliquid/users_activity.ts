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
    hyperliquidUserActivityEventTypeSchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './users_activity.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    user: { schema: evmAddressSchema },
    event_types: { schema: hyperliquidUserActivityEventTypeSchema, batched: true, optional: true },
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
            event_type: hyperliquidUserActivityEventTypeSchema,
            user: z.string(),
            counterparty: z.string(),
            amount: z.number(),
            token: z.string(),
            notes: z.string(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'User Activity',
        description:
            'Returns a chronological feed of balance-changing events for a user — bridge deposits/withdrawals, on-chain account deposits/withdrawals, vault deposits/withdrawals, liquidations, and funding payments. Each row carries an `event_type` discriminator and a `notes` field with type-specific extras (e.g. funding rate and position size for funding events).\n\nFor trade fills, use `/v1/hyperliquid/markets/activity` instead.\n\nSupply `event_types` (comma-separated) to filter to a subset. Defaults to the last 30 days when no time range is specified — provide `start_time` and `end_time` to query older data.',
        tags: ['Hyperliquid Users'],
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
                                            block_num: 979112711,
                                            timestamp: '2026-04-30 23:00:00',
                                            transaction_hash:
                                                '0x0000000000000000000000000000000000000000000000000000000000000000',
                                            event_index: 7001290,
                                            event_type: 'funding',
                                            user: '0xecb63caa47c7c4e77f60f1ce858cf28dc2b82b00',
                                            counterparty: 'cash:SILVER',
                                            amount: -0.31788,
                                            token: 'USDC',
                                            notes: 'position_size=685.52,rate=0.00000625',
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

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        network: 'hyperliquid',
        db_hypercore: hypercore.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
