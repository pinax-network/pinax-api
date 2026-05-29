import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { AGGREGATOR_EVM_PROTOCOLS, config, EXCLUDED_EVM_PROTOCOLS } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import {
    TVM_CONTRACT_USDT_EXAMPLE,
    TVM_CONTRACT_WTRX_EXAMPLE,
    TVM_FACTORY_SUNSWAP_EXAMPLE,
    TVM_POOL_USDT_WTRX_EXAMPLE,
} from '../../types/examples.js';
import {
    apiUsageResponseSchema,
    createQuerySchema,
    tvmContractSchema,
    tvmFactorySchema,
    tvmNetworkIdSchema,
    tvmPoolSchema,
    tvmProtocolSchema,
    tvmTokenResponseSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './evm.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    network: { schema: tvmNetworkIdSchema },

    factory: {
        schema: tvmFactorySchema,
        batched: true,
        optional: true,
        meta: { example: TVM_FACTORY_SUNSWAP_EXAMPLE },
    },
    pool: { schema: tvmPoolSchema, batched: true, optional: true, meta: { example: TVM_POOL_USDT_WTRX_EXAMPLE } },
    input_token: {
        schema: tvmContractSchema,
        batched: true,
        optional: true,
        meta: { example: TVM_CONTRACT_USDT_EXAMPLE },
    },
    output_token: {
        schema: tvmContractSchema,
        batched: true,
        optional: true,
        meta: { example: TVM_CONTRACT_WTRX_EXAMPLE },
    },
    protocol: { schema: tvmProtocolSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            // -- block --
            // block_num: z.number(),
            // datetime: dateTimeSchema,

            // -- transaction --
            // transaction_id: z.string(),

            // -- pool --
            factory: tvmFactorySchema,
            pool: tvmPoolSchema,
            input_token: tvmTokenResponseSchema,
            output_token: tvmTokenResponseSchema,
            fee: z.number(),
            protocol: tvmProtocolSchema,

            // -- stats --
            transactions: z.number(),

            // -- chain --
            network: tvmNetworkIdSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Liquidity Pools',
        description: 'Returns DEX pool metadata including tokens, fees and protocol.',
        tags: ['TVM DEXs'],
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
                                            pool: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE',
                                            factory: 'TXk8rQSAvPvBBNtqSoY6nCfsXWCSSpTVQF',
                                            protocol: 'uniswap_v1',
                                            input_token: {
                                                address: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
                                                symbol: 'TRX',
                                                decimals: 6,
                                            },
                                            output_token: {
                                                address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
                                                symbol: 'USDT',
                                                decimals: 6,
                                            },
                                            fee: 3000,
                                            transactions: 1234567,
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

    const dbDex = config.dexesDatabases[params.network];
    if (!dbDex) {
        return c.json({ error: `Network not found: ${params.network}` }, 400);
    }

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        db_dex: dbDex.database,
        excluded_protocols: EXCLUDED_EVM_PROTOCOLS,
        aggregator_protocols: AGGREGATOR_EVM_PROTOCOLS,
    });
    return handleUsageQueryError(c, response);
});

export default route;
