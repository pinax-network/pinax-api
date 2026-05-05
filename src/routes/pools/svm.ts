import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import { SVM_MINT_WSOL_EXAMPLE } from '../../types/examples.js';
import {
    apiUsageResponseSchema,
    createQuerySchema,
    svmAmmPoolSchema,
    svmAmmSchema,
    svmMintSchema,
    svmNetworkIdSchema,
    svmProgramIdSchema,
    svmProtocolWithoutAggregatorSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './svm.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    network: { schema: svmNetworkIdSchema },
    amm: { schema: svmAmmSchema, batched: true, optional: true },
    amm_pool: { schema: svmAmmPoolSchema, batched: true, optional: true, meta: { example: '' } },
    mint: { schema: svmMintSchema, batched: true, optional: true, meta: { example: SVM_MINT_WSOL_EXAMPLE } },
    program_id: { schema: svmProgramIdSchema, batched: true, optional: true },
    protocol: { schema: svmProtocolWithoutAggregatorSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            program_id: svmProgramIdSchema,
            program_name: z.string(),

            // -- swap --
            amm: svmAmmSchema,
            amm_name: z.string(),
            amm_pool: svmAmmPoolSchema,

            input_mint: svmMintSchema,
            output_mint: svmMintSchema,
            transactions: z.number(),

            // -- chain --
            network: svmNetworkIdSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Liquidity Pools',
        description: 'Returns AMM pool information from Solana DEX protocols with transaction counts.',

        tags: ['SVM DEXs'],
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
                                            program_id: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
                                            program_name: 'Raydium Liquidity Pool V4',
                                            protocol: 'raydium_amm_v4',
                                            amm: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
                                            amm_name: 'Raydium Liquidity Pool V4',
                                            amm_pool: 'Dqb7bL7MZkuDgHrZZphRMRViJnepHxf9odx3RRwmifur',
                                            input_mint: '9bJKq2eLbLFKbcD9zYBNTrQ5Pua7hXMeivu7Fk3iWWoQ',
                                            output_mint: 'Fm34vVNQYoEkenNjCeM8MVP8mBV5EGLwA86WFHwyMcz4',
                                            transactions: 43062555,
                                            network: 'solana',
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
    const dbMetadata = config.metadataDatabases[params.network];
    const dbAccounts = config.accountsDatabases[params.network];

    if (!dbDex || !dbMetadata || !dbAccounts) {
        return c.json({ error: `Network not found: ${params.network}` }, 400);
    }

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        db_dex: dbDex.database,
        db_metadata: dbMetadata.database,
        db_accounts: dbAccounts.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
