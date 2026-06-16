import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import { EVM_CONTRACT_PUDGY_PENGUINS_EXAMPLE } from '../../types/examples.js';
import {
    apiUsageResponseSchema,
    createQuerySchema,
    evmAddressSchema,
    evmContractSchema,
    evmNetworkIdSchema,
    nftTokenStandardSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './holders_evm.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    network: { schema: evmNetworkIdSchema },
    contract: { schema: evmContractSchema, meta: { example: EVM_CONTRACT_PUDGY_PENGUINS_EXAMPLE } },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            contract: evmContractSchema,
            token_standard: nftTokenStandardSchema,
            address: evmAddressSchema,
            quantity: z.number().meta({ description: 'Number of tokens held by this address' }),
            unique_tokens: z.number().meta({ description: 'Number of unique token IDs held by this address' }),
            percentage: z.number().meta({ description: 'Percentage of total supply held by this address' }),
            network: evmNetworkIdSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'NFT Holders',
        description: 'Returns wallet addresses holding NFTs from a collection, with quantity and distribution share.',
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
                                            contract: '0xbd3531da5cf5857e7cfaa92426877b022e612cf8',
                                            token_standard: 'ERC721',
                                            address: '0x29469395eaf6f95920e59f858042f0e28d98a20b',
                                            quantity: 358,
                                            unique_tokens: 358,
                                            percentage: 4.027902790279028,
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
