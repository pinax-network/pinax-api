import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { evmBalancesDatabase } from '../../config/dbsConfig.js';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import { injectIcons } from '../../inject/icon.js';
import { nativeContractRedirect } from '../../middleware/nativeContractRedirect.js';
import { EVM_CONTRACT_USDT_EXAMPLE } from '../../types/examples.js';
import {
    apiUsageResponseSchema,
    createQuerySchema,
    dateTimeSchema,
    evmContractSchema,
    evmNetworkIdSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './evm.sql' with { type: 'text' };

const querySchema = createQuerySchema(
    {
        network: { schema: evmNetworkIdSchema },
        contract: {
            schema: evmContractSchema,
            batched: true,
            meta: { example: EVM_CONTRACT_USDT_EXAMPLE },
        },
    },
    false
);

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            last_update: dateTimeSchema,
            last_update_block_num: z.number(),
            last_update_timestamp: z.number(),
            contract: evmContractSchema,
            name: z.string().nullable(),
            symbol: z.string().nullable(),
            decimals: z.number().nullable(),
            circulating_supply: z.number(),
            total_supply: z.number(),
            holders: z.number(),
            total_transfers: z.number(),
            network: evmNetworkIdSchema,
            icon: z
                .object({
                    web3icon: z.string(),
                })
                .optional(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Token Metadata',
        description: 'Returns ERC-20 token metadata including supply and holder count.',
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
                                            last_update: '2026-02-13 20:22:47',
                                            last_update_block_num: 24450218,
                                            last_update_timestamp: 1771014167,
                                            contract: '0xdac17f958d2ee523a2206206994597c13d831ec7',
                                            circulating_supply: 96130932922.42769,
                                            holders: 12473360,
                                            total_transfers: 430131249,
                                            name: 'Tether USD',
                                            symbol: 'USDT',
                                            decimals: 6,
                                            network: 'mainnet',
                                            icon: {
                                                web3icon: 'usdt',
                                            },
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

route.use('/', nativeContractRedirect);

route.get('/', openapi, zValidator('query', querySchema, validatorHook), validator('query', querySchema), async (c) => {
    const params = c.req.valid('query');

    const dbBalances = evmBalancesDatabase(config, params.network, 'erc20');
    const dbTransfers = config.transfersDatabases[params.network];

    if (!dbBalances || !dbTransfers) {
        return c.json({ error: `Network not found: ${params.network}` }, 400);
    }
    if (!query) return c.json({ error: 'Query for tokens could not be loaded' }, 500);

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        db_balances: dbBalances.database,
        db_transfers: dbTransfers.database,
    });
    injectIcons(response);
    return handleUsageQueryError(c, response);
});

export default route;
