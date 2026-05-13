import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import { nativeContractRedirect } from '../../middleware/nativeContractRedirect.js';
import {
    apiUsageResponseSchema,
    createQuerySchema,
    dateTimeSchema,
    evmAddressSchema,
    evmContractSchema,
    evmNetworkIdSchema,
    includeNullBalancesSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './evm.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    network: { schema: evmNetworkIdSchema },
    address: { schema: evmAddressSchema, batched: true },
    contract: {
        schema: evmContractSchema,
        batched: true,
        optional: true,
        meta: { example: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
    },
    include_null_balances: { schema: includeNullBalancesSchema, default: false },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            // -- block --
            last_update: dateTimeSchema,
            last_update_block_num: z.number(),
            last_update_timestamp: z.number(),

            // -- balance --
            address: evmAddressSchema,
            contract: evmContractSchema,
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
        summary: 'Token Balances',
        description: 'Returns ERC-20 token balances for a wallet address.',
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
                                            last_update: '2025-10-08 07:49:47',
                                            last_update_block_num: 23531651,
                                            last_update_timestamp: 1759909787,
                                            address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
                                            contract: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
                                            amount: '17058407780',
                                            value: 17058.40778,
                                            name: 'USD Coin',
                                            symbol: 'USDC',
                                            decimals: 6,
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

// TEMPORARY: Redirect native contract requests to /native endpoint
// TODO: Remove this middleware once migration is complete
route.use('/', nativeContractRedirect);

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
