import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config, EXCLUDED_EVM_PROTOCOLS } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import {
    EVM_CONTRACT_USDC_EXAMPLE,
    EVM_CONTRACT_WETH_EXAMPLE,
    EVM_FACTORY_UNISWAP_V3_EXAMPLE,
    EVM_POOL_USDC_WETH_EXAMPLE,
} from '../../types/examples.js';
import {
    apiUsageResponseSchema,
    createQuerySchema,
    evmContractSchema,
    evmFactorySchema,
    evmNetworkIdSchema,
    evmPoolSchema,
    evmProtocolSchema,
    evmTokenResponseSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './evm.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    network: { schema: evmNetworkIdSchema },

    factory: {
        schema: evmFactorySchema,
        batched: true,
        optional: true,
        meta: { example: EVM_FACTORY_UNISWAP_V3_EXAMPLE },
    },
    pool: { schema: evmPoolSchema, batched: true, optional: true, meta: { example: EVM_POOL_USDC_WETH_EXAMPLE } },
    input_token: {
        schema: evmContractSchema,
        batched: true,
        optional: true,
        meta: { example: EVM_CONTRACT_USDC_EXAMPLE },
    },
    output_token: {
        schema: evmContractSchema,
        batched: true,
        optional: true,
        meta: { example: EVM_CONTRACT_WETH_EXAMPLE },
    },
    protocol: { schema: evmProtocolSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            // // -- block --
            // block_num: z.number(),
            // datetime: dateTimeSchema,
            // timestamp: z.number(),

            // // -- transaction --
            // transaction_id: z.string(),

            // -- pool --
            pool: evmPoolSchema,
            factory: evmFactorySchema,
            protocol: evmProtocolSchema,

            // -- tokens --
            input_token: evmTokenResponseSchema,
            output_token: evmTokenResponseSchema,

            // -- fees --
            fee: z.number(),

            // -- stats --
            transactions: z.number(),
            // uaw: z.number(),

            // -- chain --
            network: evmNetworkIdSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Liquidity Pools',
        description: 'Returns DEX pool metadata including tokens, fees and protocol.',

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
                                            pool: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
                                            factory: '0x1f98431c8ad98523631ae4a59f267346ea31f984',
                                            protocol: 'uniswap_v3',
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
                                            fee: 500,
                                            transactions: 1234567,
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
