import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config, EXCLUDED_EVM_PROTOCOLS } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import {
    TVM_ADDRESS_SWAP_EXAMPLE,
    TVM_CONTRACT_USDT_EXAMPLE,
    TVM_CONTRACT_WTRX_EXAMPLE,
    TVM_FACTORY_SUNSWAP_EXAMPLE,
    TVM_POOL_USDT_WTRX_EXAMPLE,
    TVM_TRANSACTION_SWAP_EXAMPLE,
} from '../../types/examples.js';
import {
    type ApiErrorResponse,
    type ApiUsageResponse,
    apiUsageResponseSchema,
    blockNumberSchema,
    createQuerySchema,
    dateTimeSchema,
    timestampSchema,
    tvmAddressSchema,
    tvmFactorySchema,
    tvmNetworkIdSchema,
    tvmPoolSchema,
    tvmProtocolSchema,
    tvmTokenResponseSchema,
    tvmTransactionSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './evm.sql' with { type: 'text' };
import { swapAddressFieldDescriptions } from './shared.js';

function stripUnsupportedTvmSwapFields(response: ApiUsageResponse) {
    return {
        ...response,
        data: response.data.map((row) => {
            const { caller: _caller, call_index: _call_index, ...rest } = row as Record<string, unknown>;
            return rest;
        }),
    };
}

function isApiErrorResponse(response: ApiUsageResponse | ApiErrorResponse): response is ApiErrorResponse {
    return 'status' in response;
}

const querySchema = createQuerySchema({
    network: { schema: tvmNetworkIdSchema },

    // transaction
    transaction_id: {
        schema: tvmTransactionSchema,
        batched: true,
        optional: true,
        meta: { example: TVM_TRANSACTION_SWAP_EXAMPLE },
    },

    // swaps
    factory: {
        schema: tvmAddressSchema,
        batched: true,
        optional: true,
        meta: { example: TVM_FACTORY_SUNSWAP_EXAMPLE },
    },
    pool: { schema: tvmPoolSchema, batched: true, optional: true, meta: { example: TVM_POOL_USDT_WTRX_EXAMPLE } },
    transaction_from: {
        schema: tvmAddressSchema,
        batched: true,
        optional: true,
        meta: { example: TVM_ADDRESS_SWAP_EXAMPLE },
    },
    user: { schema: tvmAddressSchema, batched: true, optional: true, meta: { example: TVM_ADDRESS_SWAP_EXAMPLE } },
    sender: { schema: tvmAddressSchema, batched: true, optional: true, meta: { example: TVM_ADDRESS_SWAP_EXAMPLE } },
    recipient: { schema: tvmAddressSchema, batched: true, optional: true, meta: { example: TVM_ADDRESS_SWAP_EXAMPLE } },
    input_contract: {
        schema: tvmAddressSchema,
        batched: true,
        optional: true,
        meta: { example: TVM_CONTRACT_USDT_EXAMPLE },
    },
    output_contract: {
        schema: tvmAddressSchema,
        batched: true,
        optional: true,
        meta: { example: TVM_CONTRACT_WTRX_EXAMPLE },
    },
    protocol: { schema: tvmProtocolSchema, optional: true },

    // time and block range
    start_time: { schema: timestampSchema, optional: true },
    end_time: { schema: timestampSchema, optional: true },
    start_block: { schema: blockNumberSchema, optional: true },
    end_block: { schema: blockNumberSchema, optional: true },
});

function buildTvmSwapQueryParams(params: z.infer<typeof querySchema>, dbDex: string) {
    return {
        ...params,
        caller: [],
        db_dex: dbDex,
        excluded_protocols: EXCLUDED_EVM_PROTOCOLS,
    };
}

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
            transaction_from: tvmAddressSchema.describe(swapAddressFieldDescriptions.transaction_from),
            log_index: z.number(),
            log_ordinal: z.number(),
            log_block_index: z.number(),
            log_topic0: z.string(),
            factory: tvmFactorySchema,
            pool: tvmPoolSchema,
            input_token: tvmTokenResponseSchema,
            output_token: tvmTokenResponseSchema,

            user: tvmAddressSchema.describe(swapAddressFieldDescriptions.user),
            sender: tvmAddressSchema.describe(swapAddressFieldDescriptions.sender),
            recipient: tvmAddressSchema.describe(swapAddressFieldDescriptions.recipient),

            // -- price --
            input_amount: z.string(),
            input_value: z.number(),
            output_amount: z.string(),
            output_value: z.number(),
            price: z.number(),
            price_inv: z.number(),
            protocol: tvmProtocolSchema,
            summary: z.string(),

            // -- chain --
            network: tvmNetworkIdSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Swap Events',
        description:
            'Returns DEX swap events with input and output token amounts.\n\nAddress semantics: `transaction_from` is the on-chain transaction initiator and `user` is the normalized swap address. `sender` and `recipient` remain available for legacy compatibility; new integrations should prefer `user` and plan for `sender` and `recipient` deprecation in a future major release.',

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
                                            block_num: 28320009,
                                            datetime: '2021-03-10 04:43:33',
                                            timestamp: 1615351413,
                                            transaction_id:
                                                '0x3e0f39b48dae8c49d3f95bc6206a632af484059764487b0c7d3e3c97bb433130',
                                            transaction_index: 10,
                                            transaction_from: 'TSLjVj4sL7uDWQXDbHyV3Kbgz1KL9jB78w',
                                            log_ordinal: 0,
                                            log_block_index: 0,
                                            log_index: 0,
                                            log_topic0:
                                                'd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822',
                                            factory: 'TXk8rQSAvPvBBNtqSoY6nCfsXWCSSpTVQF',
                                            pool: 'TAqCH2kadHAugPEorFrpT7Kogqo2FckxWA',
                                            user: 'TSLjVj4sL7uDWQXDbHyV3Kbgz1KL9jB78w',
                                            sender: 'TSLjVj4sL7uDWQXDbHyV3Kbgz1KL9jB78w',
                                            recipient: 'TSLjVj4sL7uDWQXDbHyV3Kbgz1KL9jB78w',
                                            input_token: {
                                                address: 'TGc9XV7skLENAHPj4afCpBS8JSHv6box9C',
                                                symbol: '',
                                                decimals: 0,
                                            },
                                            output_token: {
                                                address: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
                                                symbol: 'TRX',
                                                decimals: 6,
                                            },
                                            input_amount: '20000000',
                                            input_value: 20000000,
                                            output_amount: '1258054968',
                                            output_value: 1258.054968,
                                            price: 0.0000629027484,
                                            price_inv: 15897.556552552798,
                                            protocol: 'uniswap_v1',
                                            summary: 'Swap 20.00 million  for 1.26 thousand TRX on Uniswap V1',
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

    const response = await makeUsageQueryJson(c, [query], buildTvmSwapQueryParams(params, dbDex.database));
    if (isApiErrorResponse(response)) return handleUsageQueryError(c, response);
    return c.json(stripUnsupportedTvmSwapFields(response));
});

export { buildTvmSwapQueryParams, querySchema, stripUnsupportedTvmSwapFields };
export default route;
