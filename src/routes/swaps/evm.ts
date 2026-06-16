import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config, EXCLUDED_EVM_PROTOCOLS } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import {
    EVM_ADDRESS_SWAP_EXAMPLE,
    EVM_CONTRACT_USDC_EXAMPLE,
    EVM_CONTRACT_WETH_EXAMPLE,
    EVM_FACTORY_UNISWAP_V2_EXAMPLE,
    EVM_POOL_USDC_WETH_EXAMPLE,
    EVM_TRANSACTION_SWAP_EXAMPLE,
} from '../../types/examples.js';
import {
    apiUsageResponseSchema,
    blockNumberSchema,
    createQuerySchema,
    dateTimeSchema,
    evmAddressSchema,
    evmContractSchema,
    evmFactorySchema,
    evmNetworkIdSchema,
    evmPoolSchema,
    evmProtocolSchema,
    evmTokenResponseSchema,
    evmTransactionSchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './evm.sql' with { type: 'text' };
import { swapAddressFieldDescriptions } from './shared.js';

const querySchema = createQuerySchema({
    network: { schema: evmNetworkIdSchema },

    transaction_id: {
        schema: evmTransactionSchema,
        batched: true,
        optional: true,
        meta: { example: EVM_TRANSACTION_SWAP_EXAMPLE },
    },
    factory: {
        schema: evmFactorySchema,
        batched: true,
        optional: true,
        meta: { example: EVM_FACTORY_UNISWAP_V2_EXAMPLE },
    },
    pool: { schema: evmPoolSchema, batched: true, optional: true, meta: { example: EVM_POOL_USDC_WETH_EXAMPLE } },
    caller: { schema: evmAddressSchema, batched: true, optional: true, meta: { example: EVM_ADDRESS_SWAP_EXAMPLE } },
    transaction_from: {
        schema: evmAddressSchema,
        batched: true,
        optional: true,
        meta: { example: EVM_ADDRESS_SWAP_EXAMPLE },
    },
    user: { schema: evmAddressSchema, batched: true, optional: true, meta: { example: EVM_ADDRESS_SWAP_EXAMPLE } },
    sender: { schema: evmAddressSchema, batched: true, optional: true, meta: { example: EVM_ADDRESS_SWAP_EXAMPLE } },
    recipient: { schema: evmAddressSchema, batched: true, optional: true, meta: { example: EVM_ADDRESS_SWAP_EXAMPLE } },
    input_contract: {
        schema: evmContractSchema,
        batched: true,
        optional: true,
        meta: { example: EVM_CONTRACT_USDC_EXAMPLE },
    },
    output_contract: {
        schema: evmContractSchema,
        batched: true,
        optional: true,
        meta: { example: EVM_CONTRACT_WETH_EXAMPLE },
    },
    protocol: { schema: evmProtocolSchema, optional: true },

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

            // -- swap --
            transaction_id: z.string(),
            transaction_index: z.number(),
            transaction_from: evmAddressSchema.describe(swapAddressFieldDescriptions.transaction_from),
            call_index: z.number().nullable(),
            log_index: z.number(),
            log_ordinal: z.number(),
            log_block_index: z.number(),
            log_topic0: z.string(),
            factory: evmFactorySchema,
            pool: evmPoolSchema,
            input_token: evmTokenResponseSchema,
            output_token: evmTokenResponseSchema,

            caller: evmAddressSchema.describe(swapAddressFieldDescriptions.caller),
            user: evmAddressSchema.describe(swapAddressFieldDescriptions.user),
            sender: evmAddressSchema.describe(swapAddressFieldDescriptions.sender),
            recipient: evmAddressSchema.describe(swapAddressFieldDescriptions.recipient),

            // -- price --
            input_amount: z.string(),
            input_value: z.number(),
            output_amount: z.string(),
            output_value: z.number(),
            price: z.number(),
            price_inv: z.number(),
            protocol: evmProtocolSchema,
            summary: z.string(),

            // -- chain --
            network: evmNetworkIdSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Swap Events',
        description: 'Returns DEX swap events with input and output token amounts.',
        tags: ['EVM DEXs'],
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
                                            block_num: 23590326,
                                            datetime: '2025-10-16 12:48:47',
                                            timestamp: 1760618927,
                                            transaction_id:
                                                '0xf6374799c227c9db38ff5ac1d5bebe8b607a1de1238cd861ebd1053ec07305ca',
                                            transaction_index: 143,
                                            transaction_from: '0xa69babef1ca67a37ffaf7a485dfff3382056e78c',
                                            call_index: null,
                                            log_ordinal: 42,
                                            log_block_index: 0,
                                            log_index: 42,
                                            log_topic0:
                                                '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67',
                                            factory: '0x1f98431c8ad98523631ae4a59f267346ea31f984',
                                            pool: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
                                            input_token: {
                                                address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
                                                symbol: 'USDC',
                                                decimals: 6,
                                            },
                                            output_token: {
                                                address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
                                                symbol: 'WETH',
                                                decimals: 18,
                                            },
                                            caller: '0xa69babef1ca67a37ffaf7a485dfff3382056e78c',
                                            user: '0xa69babef1ca67a37ffaf7a485dfff3382056e78c',
                                            sender: '0xa69babef1ca67a37ffaf7a485dfff3382056e78c',
                                            recipient: '0xa69babef1ca67a37ffaf7a485dfff3382056e78c',
                                            input_amount: '40735537734',
                                            input_value: 40735.537734,
                                            output_amount: '10042247631260591234',
                                            output_value: 10.042247631260592,
                                            price: 246517483.4798306,
                                            price_inv: 4.0565074163667475e-9,
                                            protocol: 'uniswap_v3',
                                            summary:
                                                'Swap 40.74 thousand USDC for 10.042247631260592 WETH on Uniswap V3',
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
