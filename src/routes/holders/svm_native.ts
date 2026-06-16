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
    svmProgramIdSchema,
    svmTokenAccountSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './svm_native.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    network: { schema: svmNetworkIdSchema },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            // -- block --
            last_update: dateTimeSchema,
            last_update_block_num: z.number(),
            last_update_timestamp: z.number(),

            // -- token --
            program_id: svmProgramIdSchema,
            mint: svmMintSchema,

            // -- account --
            token_account: svmTokenAccountSchema,

            // -- amount --
            amount: z.string(),
            value: z.number().describe('Decimal-scaled token amount (= amount / 10^decimals). Not a USD value.'),
            decimals: z.number(),

            // -- metadata --
            name: z.string().nullable(),
            symbol: z.string().nullable(),

            // -- chain --
            network: svmNetworkIdSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Native Holders',
        description: 'Returns the top holders of native SOL, ranked by balance.',

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
                                            last_update: '2026-04-14 05:23:33',
                                            last_update_block_num: 413099031,
                                            last_update_timestamp: 1776144213,
                                            program_id: '11111111111111111111111111111111',
                                            mint: 'So11111111111111111111111111111111111111111',
                                            token_account: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
                                            amount: '15742688816057762',
                                            value: 15742688.816057762,
                                            decimals: 9,
                                            name: 'SOL',
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
    const dbAccounts = config.accountsDatabases[params.network];
    const dbMetadata = config.metadataDatabases[params.network];

    if (!dbBalances || !dbAccounts || !dbMetadata) {
        return c.json({ error: `Network not found: ${params.network}` }, 400);
    }

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        db_balances: dbBalances.database,
        db_accounts: dbAccounts.database,
        db_metadata: dbMetadata.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
