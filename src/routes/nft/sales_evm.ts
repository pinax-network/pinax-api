import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import { natives as nativeContracts } from '../../registry/natives.js';
import {
    EVM_ADDRESS_NFT_OFFERER_EXAMPLE,
    EVM_ADDRESS_NFT_RECIPIENT_EXAMPLE,
    EVM_CONTRACT_PUDGY_PENGUINS_EXAMPLE,
    EVM_TOKEN_ID_PUDGY_PENGUIN_EXAMPLE,
    EVM_TRANSACTION_NFT_SALE_EXAMPLE,
} from '../../types/examples.js';
import {
    apiUsageResponseSchema,
    blockNumberSchema,
    createQuerySchema,
    dateTimeSchema,
    evmAddressSchema,
    evmContractSchema,
    evmNetworkIdSchema,
    evmTransactionSchema,
    nftTokenIdSchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './sales_evm.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    network: { schema: evmNetworkIdSchema },

    transaction_id: {
        schema: evmTransactionSchema,
        batched: true,
        optional: true,
        meta: { example: EVM_TRANSACTION_NFT_SALE_EXAMPLE },
    },
    contract: {
        schema: evmContractSchema,
        batched: true,
        optional: true,
        meta: { example: EVM_CONTRACT_PUDGY_PENGUINS_EXAMPLE },
    },
    token_id: {
        schema: nftTokenIdSchema,
        batched: true,
        optional: true,
        meta: { example: EVM_TOKEN_ID_PUDGY_PENGUIN_EXAMPLE },
    },
    address: {
        schema: evmAddressSchema,
        batched: true,
        optional: true,
        meta: { example: EVM_ADDRESS_NFT_OFFERER_EXAMPLE },
    },
    from_address: {
        schema: evmAddressSchema,
        batched: true,
        optional: true,
        meta: { example: EVM_ADDRESS_NFT_OFFERER_EXAMPLE },
    },
    to_address: {
        schema: evmAddressSchema,
        batched: true,
        optional: true,
        meta: { example: EVM_ADDRESS_NFT_RECIPIENT_EXAMPLE },
    },

    start_time: { schema: timestampSchema, optional: true },
    end_time: { schema: timestampSchema, optional: true },
    start_block: { schema: blockNumberSchema, optional: true },
    end_block: { schema: blockNumberSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            // Block
            block_num: z.number(),
            datetime: dateTimeSchema,
            timestamp: z.number(),

            // Sale
            transaction_id: evmTransactionSchema,
            contract: evmContractSchema,
            token_id: nftTokenIdSchema,
            name: z.string().nullable(),
            symbol: z.string().nullable(),
            offerer: evmAddressSchema,
            recipient: evmAddressSchema,
            sale_amount: z.number(),
            sale_currency: z.string(),

            network: evmNetworkIdSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'NFT Sales',
        description: 'Returns NFT marketplace sales with price, buyer, seller, and transaction data.',

        tags: ['EVM NFTs'],
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
                                            block_num: 22098625,
                                            datetime: '2025-03-21 23:46:11',
                                            timestamp: 1742600771,
                                            transaction_id:
                                                '0x8cc8b83e7b7fec752bd689700156990e7ce4d6b890f7b5ab58adf2fb602a98b9',
                                            contract: '0xbd3531da5cf5857e7cfaa92426877b022e612cf8',
                                            token_id: '5712',
                                            name: 'PudgyPenguins',
                                            symbol: 'PPG',
                                            offerer: '0x355062b5d0e324815290b96370e87607a71d613d',
                                            recipient: '0x7ccde43632b3287fda060719d802b2c4cb6f769b',
                                            sale_amount: 9.73,
                                            sale_currency: 'ETH',
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

const nativeSymbols = new Map([
    ['mainnet', 'ETH'],
    ['bsc', 'BNB'],
    ['base', 'ETH'],
    ['arbitrum-one', 'ETH'],
    ['optimism', 'ETH'],
    ['matic', 'POL'],
    ['polygon', 'POL'],
    ['unichain', 'ETH'],
    ['avalanche', 'AVAX'],
    ['hyperevm', 'HYPE'],
    ['solana', 'SOL'],
]);

route.get('/', openapi, zValidator('query', querySchema, validatorHook), validator('query', querySchema), async (c) => {
    const params = c.req.valid('query');

    const dbNft = config.nftsDatabases[params.network];
    if (!dbNft) {
        return c.json({ error: `Network not found: ${params.network}` }, 400);
    }

    const sale_currency = nativeSymbols.get(params.network) ?? 'Native';

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        sale_currency,
        nativeContracts: Array.from(nativeContracts),
        db_nft: dbNft.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
