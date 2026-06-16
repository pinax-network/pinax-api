import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import { EVM_CONTRACT_BAYC_EXAMPLE, EVM_TOKEN_ID_BAYC_EXAMPLE } from '../../types/examples.js';
import {
    apiUsageResponseSchema,
    createQuerySchema,
    evmAddressSchema,
    evmContractSchema,
    evmNetworkIdSchema,
    includeNullBalancesSchema,
    nftTokenIdSchema,
    nftTokenStandardSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './ownerships_evm.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    network: { schema: evmNetworkIdSchema },
    address: { schema: evmAddressSchema, batched: true },
    contract: {
        schema: evmContractSchema,
        batched: true,
        optional: true,
        meta: { example: EVM_CONTRACT_BAYC_EXAMPLE },
    },
    token_id: { schema: nftTokenIdSchema, batched: true, optional: true, meta: { example: EVM_TOKEN_ID_BAYC_EXAMPLE } },
    token_standard: { schema: nftTokenStandardSchema, optional: true },
    include_null_balances: { schema: includeNullBalancesSchema, default: false },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            // NFT token metadata
            address: evmAddressSchema,
            contract: evmContractSchema,
            token_id: nftTokenIdSchema,
            token_standard: nftTokenStandardSchema,

            name: z.string().nullable(),
            symbol: z.string().nullable(),

            network: evmNetworkIdSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'NFT Ownerships',
        description: 'Returns NFTs owned by a wallet address, with metadata and ownership context.',
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
                                            address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
                                            contract: '0x000386e3f7559d9b6a2f5c46b4ad1a9587d59dc3',
                                            token_id: '12',
                                            token_standard: 'ERC721',
                                            name: 'Bored Ape Nike Club',
                                            symbol: 'BANC',
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

    const dbNft = config.nftsDatabases[params.network];
    if (!dbNft) {
        return c.json({ error: `Network not found: ${params.network}` }, 400);
    }

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        db_nft: dbNft.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
