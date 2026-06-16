import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import { apiUsageResponseSchema, createQuerySchema, dateTimeSchema, tvmNetworkIdSchema } from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './tvm_native.sql' with { type: 'text' };

const querySchema = createQuerySchema(
    {
        network: { schema: tvmNetworkIdSchema },
    },
    false
);

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            last_update: dateTimeSchema,
            last_update_block_num: z.number(),
            last_update_timestamp: z.number(),

            decimals: z.number().nullable(),
            name: z.string().nullable(),
            symbol: z.string().nullable(),

            network: z.string(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Native Metadata',
        description: 'Returns native token metadata including supply and holder count.',

        tags: ['TVM Tokens (Native)'],
        security: [{ bearerAuth: [] }],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': {
                        schema: resolver(responseSchema),
                        examples: {
                            example: {
                                value: {
                                    data: [
                                        {
                                            last_update: '2026-01-25 14:51:18',
                                            last_update_block_num: 79562903,
                                            last_update_timestamp: 1769352678,
                                            name: 'Tron',
                                            symbol: 'TRX',
                                            decimals: 6,
                                            network: 'tron',
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

    const dbTransfers = config.transfersDatabases[params.network];

    if (!dbTransfers) {
        return c.json({ error: `Network not found: ${params.network}` }, 400);
    }
    if (!query) return c.json({ error: 'Query for tokens could not be loaded' }, 500);

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        db_transfers: dbTransfers.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
