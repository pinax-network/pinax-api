import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import {
    apiUsageResponseSchema,
    createQuerySchema,
    dateTimeSchema,
    svmMintSchema,
    svmNetworkIdSchema,
    svmSPLTokenProgramIdSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './svm_native.sql' with { type: 'text' };

const querySchema = createQuerySchema(
    {
        network: { schema: svmNetworkIdSchema },
    },
    false
);

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            last_update: dateTimeSchema,
            last_update_block_num: z.number(),
            last_update_timestamp: z.number(),

            program_id: svmSPLTokenProgramIdSchema,
            mint: svmMintSchema,
            decimals: z.number().nullable(),

            circulating_supply: z.number(),
            holders: z.number(),

            name: z.string(),
            symbol: z.string(),

            network: z.string(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Native Metadata',
        description: 'Returns native SOL metadata including supply and holder count.',
        tags: ['SVM Tokens (Native)'],
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
                                            last_update: '2026-04-15 18:15:06',
                                            last_update_block_num: 413435325,
                                            last_update_timestamp: 1776276906,
                                            program_id: '11111111111111111111111111111111',
                                            mint: 'So11111111111111111111111111111111111111111',
                                            decimals: 9,
                                            circulating_supply: 655531029.8522874,
                                            holders: 1115989639,
                                            name: 'Native',
                                            symbol: 'SOL',
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

    const dbBalances = config.balancesDatabases[params.network];

    if (!dbBalances) {
        return c.json({ error: `Network not found: ${params.network}` }, 400);
    }
    if (!query) return c.json({ error: 'Query for tokens could not be loaded' }, 500);

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        db_balances: dbBalances.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
