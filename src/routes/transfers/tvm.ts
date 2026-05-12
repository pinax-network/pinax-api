import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import { nativeContractRedirect } from '../../middleware/nativeContractRedirect.js';
import {
    TVM_ADDRESS_FROM_EXAMPLE,
    TVM_ADDRESS_TO_EXAMPLE,
    TVM_CONTRACT_USDT_EXAMPLE,
    TVM_TRANSACTION_TRC20_TRANSFER_EXAMPLE,
} from '../../types/examples.js';
import {
    apiUsageResponseSchema,
    blockNumberSchema,
    createQuerySchema,
    dateTimeSchema,
    timestampSchema,
    tvmAddressSchema,
    tvmContractSchema,
    tvmNetworkIdSchema,
    tvmTransactionSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './evm.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    network: { schema: tvmNetworkIdSchema },

    transaction_id: {
        schema: tvmTransactionSchema,
        batched: true,
        optional: true,
        meta: { example: TVM_TRANSACTION_TRC20_TRANSFER_EXAMPLE },
    },
    contract: {
        schema: tvmContractSchema,
        batched: true,
        optional: true,
        meta: { example: TVM_CONTRACT_USDT_EXAMPLE },
    },
    // address: { schema: tvmAddressSchema, batched: true, default: '' },
    from_address: {
        schema: tvmAddressSchema,
        batched: true,
        optional: true,
        meta: { example: TVM_ADDRESS_FROM_EXAMPLE },
    },
    to_address: { schema: tvmAddressSchema, batched: true, optional: true, meta: { example: TVM_ADDRESS_TO_EXAMPLE } },

    start_time: { schema: timestampSchema, optional: true },
    end_time: { schema: timestampSchema, optional: true },
    start_block: { schema: blockNumberSchema, optional: true },
    end_block: { schema: blockNumberSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            // -- block --
            block_num: z.number(),
            datetime: dateTimeSchema,
            timestamp: z.number(),

            // -- transaction --
            transaction_id: tvmTransactionSchema,
            transaction_index: z.number(),

            // -- log --
            log_index: z.number(),
            log_ordinal: z.number(),

            // -- transfer --
            contract: tvmContractSchema,
            from: tvmAddressSchema,
            to: tvmAddressSchema,

            amount: z.string(),
            value: z.number().describe('Decimal-scaled token amount (= amount / 10^decimals). Not a USD value.'),

            // -- contract --
            name: z.string().nullable(),
            symbol: z.string().nullable(),
            decimals: z.number().nullable(),

            // -- chain --
            network: tvmNetworkIdSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Token Transfers',
        description: 'Returns ERC-20 transfers with transaction and block data.',
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
                                            block_num: 49014118,
                                            datetime: '2023-03-01 06:55:06',
                                            timestamp: 1677653706,
                                            transaction_id:
                                                '0xa85ee0572469b128690c00a80f03a328c882b7339496faf64a1ad0707b537329',
                                            log_index: 0,
                                            contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
                                            type: 'transfer',
                                            from: 'THx5jmvnQkRjDpYEpkaLn7yCvgafXzxiAF',
                                            to: 'TCc3eBTbWXcUwfmgWP58VnyVGS6HE3gGe3',
                                            name: 'Tether USD',
                                            symbol: 'USDT',
                                            decimals: 6,
                                            amount: '10000000000',
                                            value: 10000,
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

// TEMPORARY: Redirect native contract requests to /native endpoint
// TODO: Remove this middleware once migration is complete
route.use('/', nativeContractRedirect);

route.get('/', openapi, zValidator('query', querySchema, validatorHook), validator('query', querySchema), async (c) => {
    const params = c.req.valid('query');
    const dbTransfers = config.transfersDatabases[params.network];

    if (!dbTransfers) {
        return c.json({ error: `Network not found: ${params.network}` }, 400);
    }

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        db_transfers: dbTransfers.database,
    });

    return handleUsageQueryError(c, response);
});

export default route;
