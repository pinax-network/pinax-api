import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import { EVM_ADDRESS_TO_EXAMPLE } from '../../types/examples.js';
import {
    apiUsageResponseSchema,
    blockNumberSchema,
    createQuerySchema,
    dateTimeSchema,
    evmAddressSchema,
    evmNetworkIdSchema,
    evmTransactionSchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './evm_native.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    network: { schema: evmNetworkIdSchema },

    transaction_id: {
        schema: evmTransactionSchema,
        batched: true,
        optional: true,
        meta: { example: '0xd671e7314849d87f852c3674fd98157f1faf512364640c37ea38e997f67bd088' },
    },
    // address: { schema: evmAddressSchema, batched: true, default: '' },
    from_address: { schema: evmAddressSchema, batched: true, optional: true },
    to_address: { schema: evmAddressSchema, batched: true, optional: true, meta: { example: EVM_ADDRESS_TO_EXAMPLE } },

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
            transaction_id: evmTransactionSchema,

            // -- transfer --
            from: evmAddressSchema,
            to: evmAddressSchema,

            // -- contract --
            name: z.string().nullable(),
            symbol: z.string().nullable(),
            decimals: z.number().nullable(),

            amount: z.string(),
            value: z.number().describe('Decimal-scaled token amount (= amount / 10^decimals). Not a USD value.'),

            // -- chain --
            network: evmNetworkIdSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Native Transfers',
        description: 'Returns Native transfers with transaction and block data.',
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
                                            block_num: 24280071,
                                            datetime: '2026-01-21 02:07:35',
                                            timestamp: 1768961255,
                                            transaction_id:
                                                '0x73d346e1d286b893a3a0bb6b022845dc84cded73757b9ad89ae2c958fe266edf',
                                            transaction_index: 251,
                                            call_index: 3,
                                            type: 'call',
                                            from: '0xd2b37ade14708bf18904047b1e31f8166d39612b',
                                            to: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
                                            name: 'Ethereum',
                                            symbol: 'ETH',
                                            decimals: 18,
                                            amount: '25000000000000',
                                            value: 0.000025,
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
