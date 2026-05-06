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
    hyperliquidCoinSchema,
    hyperliquidDexIdSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './users_positions.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    user: { schema: evmAddressSchema },
    coin: { schema: hyperliquidCoinSchema, optional: true },
    dex: { schema: hyperliquidDexIdSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            user: z.string(),
            coin: z.string(),
            market_name: z.string(),
            dex: z.string(),
            position_size: z.number(),
            funding_rate: z.number(),
            last_update: dateTimeSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'User Positions',
        description:
            'Returns the current signed position (`position_size`) per coin for a user, reconstructed from the latest funding snapshot per `(user, coin)` pair. Positive `position_size` indicates a long position, negative indicates a short. Each row also carries the funding rate applied at that snapshot and the snapshot timestamp.\n\nFilter by `coin` for a single coin, or `dex` to return only positions on one venue (`xyz`, `cash`, etc.).\n\nCaveat: positions opened and fully closed between two funding snapshots are never observed during settlement and will not appear here.',
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
                                            user: '0xecb63caa47c7c4e77f60f1ce858cf28dc2b82b00',
                                            coin: 'PUMP',
                                            market_name: 'PUMP',
                                            dex: 'perps',
                                            position_size: -998618146,
                                            funding_rate: 0.0000125,
                                            last_update: '2026-04-30 23:00:00',
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
