import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import {
    TVM_ADDRESS_FROM_EXAMPLE,
    TVM_ADDRESS_NATIVE_TO_EXAMPLE,
    TVM_TRANSACTION_NATIVE_TRANSFER_EXAMPLE,
} from '../../types/examples.js';
import {
    apiUsageResponseSchema,
    blockNumberSchema,
    createQuerySchema,
    dateTimeSchema,
    timestampSchema,
    tvmAddressSchema,
    tvmNetworkIdSchema,
    tvmTransactionSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './evm_native.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    network: { schema: tvmNetworkIdSchema },

    transaction_id: {
        schema: tvmTransactionSchema,
        batched: true,
        optional: true,
        meta: { example: TVM_TRANSACTION_NATIVE_TRANSFER_EXAMPLE },
    },
    from_address: {
        schema: tvmAddressSchema,
        batched: true,
        optional: true,
        meta: { example: TVM_ADDRESS_FROM_EXAMPLE },
    },
    to_address: {
        schema: tvmAddressSchema,
        batched: true,
        optional: true,
        meta: { example: TVM_ADDRESS_NATIVE_TO_EXAMPLE },
    },

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

            // -- transfer --
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
        summary: 'Native Transfers',
        description: 'Returns native token transfers with transaction and block data.',
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
                                            block_num: 79432572,
                                            datetime: '2026-01-21 02:12:54',
                                            timestamp: 1768961574,
                                            transaction_id:
                                                '0x0909857e613151f23c51d30829de6a7ba5307cbf74de1fd67dcf67aadfbaa55a',
                                            transaction_index: 131,
                                            call_index: null,
                                            type: 'transaction',
                                            from: '0x177b7305b003d1e61941c5eec3737e482a1fe947',
                                            to: '0xb41393b990cb28881458313d77910c6164772036',
                                            name: 'Tron',
                                            symbol: 'TRX',
                                            decimals: 6,
                                            amount: '5000000',
                                            value: 5,
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

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        db_transfers: dbTransfers.database,
    });

    return handleUsageQueryError(c, response);
});

export default route;
