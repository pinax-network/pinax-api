import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import { nativeContractRedirect } from '../../middleware/nativeContractRedirect.js';
import { EVM_CONTRACT_USDT_EXAMPLE } from '../../types/examples.js';
import {
    apiUsageResponseSchema,
    createQuerySchema,
    dateTimeSchema,
    evmAddressSchema,
    evmContractSchema,
    evmNetworkIdSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './evm.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    network: { schema: evmNetworkIdSchema },
    contract: { schema: evmContractSchema, meta: { example: EVM_CONTRACT_USDT_EXAMPLE } },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            // -- block --
            last_update: dateTimeSchema,
            last_update_block_num: z.number(),
            last_update_timestamp: z.number(),

            // -- contract --
            address: evmAddressSchema,
            contract: evmContractSchema,
            amount: z.string(),
            value: z.number().describe('Decimal-scaled token amount (= amount / 10^decimals). Not a USD value.'),

            // -- contract --
            name: z.string().nullable(),
            symbol: z.string().nullable(),
            decimals: z.number().nullable(),

            // -- chain --
            network: evmNetworkIdSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Token Holders',
        description: 'Returns top token holders ranked by ERC-20 balance.',

        tags: ['EVM Tokens (ERC-20)'],
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
                                            last_update: '2026-01-23 06:37:11',
                                            last_update_block_num: 24295739,
                                            last_update_timestamp: 1769150231,
                                            address: '0xf977814e90da44bfa03b6295a0616a897441acec',
                                            contract: '0xdac17f958d2ee523a2206206994597c13d831ec7',
                                            amount: '20000000000000000',
                                            value: 20000000000,
                                            name: 'Tether USD',
                                            symbol: 'USDT',
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
