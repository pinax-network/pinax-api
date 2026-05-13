import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import { nativeMintRedirect } from '../../middleware/nativeContractRedirect.js';
import { SVM_MINT_WSOL_EXAMPLE } from '../../types/examples.js';
import {
    apiUsageResponseSchema,
    createQuerySchema,
    dateTimeSchema,
    svmMintSchema,
    svmNetworkIdSchema,
    svmOwnerSchema,
    svmProgramIdSchema,
    svmTokenAccountSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';
import query from './svm.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    network: { schema: svmNetworkIdSchema },
    mint: { schema: svmMintSchema, meta: { example: SVM_MINT_WSOL_EXAMPLE } },
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
            owner: svmOwnerSchema,
            token_account: svmTokenAccountSchema,

            // -- amount --
            amount: z.string(),
            value: z.number().describe('Decimal-scaled token amount (= amount / 10^decimals). Not a USD value.'),
            decimals: z.number(),

            // -- metadata --
            name: z.string().nullable(),
            symbol: z.string().nullable(),
            uri: z.string().nullable(),

            // -- chain --
            network: svmNetworkIdSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Token Holders',
        description: 'Returns top token holders ranked by balance.',

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
                                            last_update: '2025-09-17 20:06:47',
                                            last_update_block_num: 367491952,
                                            last_update_timestamp: 1758139607,
                                            owner: '7AN6avKCJPMkXkW8kPwMuHmaWvJeHH69e8rKpLf9rdfk',
                                            token_account: 'BzWtXFf9HL2GGzMGgcGKRnFjrJiZ8U3FG8BQKTbCzW9s',
                                            mint: 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn',
                                            program_id: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
                                            amount: '365461857133582111',
                                            value: 365461857133.5821,
                                            decimals: 6,
                                            name: 'Pump',
                                            symbol: 'PUMP',
                                            uri: 'https://ipfs.io/ipfs/bafkreibcglldkfdekdkxgumlveoe6qv3pbiceypkwtli33clbzul7leo4m',
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

// TODO: Remove this middleware once migration is complete
route.use('/', nativeMintRedirect);

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
