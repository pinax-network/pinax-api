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
    evmNetworkIdSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './evm_native.sql' with { type: 'text' };

const querySchema = createQuerySchema(
    {
        network: { schema: evmNetworkIdSchema },
        address: { schema: evmAddressSchema, batched: true },
    },
    false
);

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            // -- block --
            last_update: dateTimeSchema,
            last_update_block_num: z.number(),
            last_update_timestamp: z.number(),

            // -- balance --
            address: evmAddressSchema,
            amount: z.string(),
            value: z.number().describe('Decimal-scaled token amount (= amount / 10^decimals). Not a USD value.'),

            // -- contract --
            name: z.string().nullable(),
            symbol: z.string().nullable(),
            decimals: z.number().nullable(),

            // -- network --
            network: evmNetworkIdSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Native Balances',
        description: 'Returns EVM native balances for wallet addresses.',

        tags: ['EVM Tokens (Native)'],
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
                                            last_update: '2026-01-22 11:00:11',
                                            last_update_block_num: 24289888,
                                            last_update_timestamp: 1769079611,
                                            address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
                                            amount: '32112523848657725248',
                                            value: 32.11252384865772,
                                            name: 'Ethereum',
                                            symbol: 'ETH',
                                            decimals: 18,
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

    const dbBalances = config.balancesDatabases[params.network];
    if (!dbBalances) {
        return c.json({ error: `Network not found: ${params.network}` }, 400);
    }

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        db_balances: dbBalances.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
