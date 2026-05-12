import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import { nativeContractRedirect } from '../../middleware/nativeContractRedirect.js';
import { EVM_ADDRESS_TO_EXAMPLE, EVM_TRANSACTION_TRANSFER_EXAMPLE } from '../../types/examples.js';
import {
    apiUsageResponseSchema,
    blockNumberSchema,
    createQuerySchema,
    dateTimeSchema,
    evmAddressSchema,
    evmContractSchema,
    evmNetworkIdSchema,
    evmTransactionSchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './evm.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    network: { schema: evmNetworkIdSchema },

    transaction_id: {
        schema: evmTransactionSchema,
        batched: true,
        optional: true,
        meta: { example: EVM_TRANSACTION_TRANSFER_EXAMPLE },
    },
    contract: { schema: evmContractSchema, batched: true, optional: true },
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
            contract: evmContractSchema,
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
        summary: 'Token Transfers',
        description: 'Returns ERC-20 transfers with transaction and block data.',
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
                                            block_num: 24278225,
                                            datetime: '2026-01-20 19:57:11',
                                            timestamp: 1768939031,
                                            transaction_id:
                                                '0x589cbe12efa0cca5a29b17bf7ee49c99566f0e05e937d54104134a2d916ab265',
                                            log_index: 24,
                                            contract: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
                                            type: 'transfer',
                                            from: '0x2393d38400cad1d0ffae85b37d76de05bb7eddc6',
                                            to: '0xd4f1171683f1bc07b77d0307a01b64dba5369cf8',
                                            name: 'USD Coin',
                                            symbol: 'USDC',
                                            decimals: 6,
                                            amount: '2686',
                                            value: 0.002686,
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
