import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config, EXCLUDED_EVM_PROTOCOLS } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import {
    apiUsageResponseSchema,
    createQuerySchema,
    evmAddressSchema,
    evmNetworkIdSchema,
    evmProtocolSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './evm.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    network: { schema: evmNetworkIdSchema },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            factory: evmAddressSchema,
            protocol: evmProtocolSchema,
            uaw: z.number(),
            transactions: z.number(),
            last_activity: z.string().describe('ISO 8601 datetime string'),
            network: evmNetworkIdSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Supported DEXs',
        description: 'Returns the catalog of supported EVM DEX protocols.',

        tags: ['EVM DEXs'],
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
                                            factory: '0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f',
                                            protocol: 'uniswap_v2',
                                            uaw: 10432787,
                                            transactions: 16029788,
                                            last_activity: '2025-11-06 16:00:00',
                                            network: 'mainnet',
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

    const dbDex = config.dexesDatabases[params.network];
    if (!dbDex) {
        return c.json({ error: `Network not found: ${params.network}` }, 400);
    }

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        db_dex: dbDex.database,
        excluded_protocols: EXCLUDED_EVM_PROTOCOLS,
    });
    return handleUsageQueryError(c, response);
});

export default route;
