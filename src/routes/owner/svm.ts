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
    svmNetworkIdSchema,
    svmOwnerSchema,
    svmTokenAccountSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './svm.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    network: { schema: svmNetworkIdSchema },
    account: {
        schema: svmTokenAccountSchema,
        batched: true,
        meta: { example: '5UZfa66rzeDpD9wKs3Sn3iewmavxYvpAtiF2Lqd2n1wW' },
    },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            // -- block --
            last_update: dateTimeSchema,
            last_update_block_num: z.number(),
            last_update_timestamp: z.number(),

            // -- contract --
            account: svmTokenAccountSchema,
            owner: svmOwnerSchema,
            is_closed: z.boolean(),

            // -- chain --
            network: svmNetworkIdSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'ATA Owner Lookup',
        description: 'Returns the owner of an Associated Token Account (ATA), including closure status.',

        tags: ['SVM Tokens'],
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
                                            last_update: '2025-07-14 17:17:19',
                                            last_update_block_num: 353288878,
                                            last_update_timestamp: 1752513439,
                                            account: '5UZfa66rzeDpD9wKs3Sn3iewmavxYvpAtiF2Lqd2n1wW',
                                            owner: 'GXYBNgyYKbSLr938VJCpmGLCUaAHWsncTi7jDoQSdFR9',
                                            is_closed: false,
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

    const dbAccounts = config.accountsDatabases[params.network];
    if (!dbAccounts) {
        return c.json({ error: `Network not found: ${params.network}` }, 400);
    }

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        db_accounts: dbAccounts.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
