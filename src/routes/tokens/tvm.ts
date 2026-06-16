import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import { injectIcons } from '../../inject/icon.js';
import { nativeContractRedirect } from '../../middleware/nativeContractRedirect.js';
import {
    apiUsageResponseSchema,
    createQuerySchema,
    dateTimeSchema,
    tvmContractSchema,
    tvmNetworkIdSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './tvm.sql' with { type: 'text' };

const querySchema = createQuerySchema(
    {
        network: { schema: tvmNetworkIdSchema },
        contract: { schema: tvmContractSchema, batched: true },
    },
    false
);

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            last_update: dateTimeSchema,
            last_update_block_num: z.number(),
            last_update_timestamp: z.number(),

            // -- identifiers --
            contract: tvmContractSchema,
            total_transfers: z.number(),

            // -- token metadata --
            decimals: z.number().nullable(),
            name: z.string().nullable(),
            symbol: z.string().nullable(),

            // -- chain --
            network: tvmNetworkIdSchema,

            // -- icon --
            icon: z
                .object({
                    web3icon: z.string(),
                })
                .optional(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Token Metadata',
        description: 'Returns ERC-20 token metadata including supply and holder count.',

        tags: ['TVM Tokens (ERC-20)'],
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
                                            last_update: '2026-02-13 20:52:42',
                                            last_update_block_num: 80117031,
                                            last_update_timestamp: 1771015962,
                                            contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
                                            total_transfers: 3051378972,
                                            name: 'Tether USD',
                                            symbol: 'USDT',
                                            decimals: 6,
                                            network: 'tron',
                                            icon: {
                                                web3icon: 'usdt',
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

// TEMPORARY: Redirect native contract requests to /native endpoint
// TODO: Remove this middleware once migration is complete
route.use('/', nativeContractRedirect);

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

    injectIcons(response);
    return handleUsageQueryError(c, response);
});

export default route;
