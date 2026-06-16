import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import { stables } from '../../registry/stables.js';
import {
    apiUsageResponseSchema,
    createQuerySchema,
    dateTimeSchema,
    evmIntervalSchema,
    svmAmmPoolSchema,
    svmAmmSchema,
    svmNetworkIdSchema,
    svmProgramIdSchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './svm.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    network: { schema: svmNetworkIdSchema },
    amm_pool: { schema: svmAmmPoolSchema },
    interval: { schema: evmIntervalSchema, prefault: '1d' },
    start_time: { schema: timestampSchema, optional: true },
    end_time: { schema: timestampSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            datetime: dateTimeSchema,
            program_id: svmProgramIdSchema,
            amm: svmAmmSchema,
            amm_pool: svmAmmPoolSchema,
            token0: z.string(),
            token0_decimals: z.number(),
            token1: z.string(),
            token1_decimals: z.number(),
            open: z.number(),
            high: z.number(),
            low: z.number(),
            close: z.number(),
            volume: z.number(),
            uaw: z.number(),
            transactions: z.number(),
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Pool OHLCV',
        description:
            'Returns OHLCV price candles for Solana DEX pools.\n\nHistorical depth is subject to plan restrictions.',
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
                                            datetime: '2025-07-03 00:00:00',
                                            amm: 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',
                                            amm_pool: 'AmmpSnW5xVeKHTAU9fMjyKEMPgrzmUj3ah5vgvHhAB5J',
                                            token0: 'GfMuixkXCBb612QNnPUTG696mn3R7ptnvsK31KN1e3q9',
                                            token0_decimals: 9,
                                            token1: 'So11111111111111111111111111111111111111112',
                                            token1_decimals: 9,
                                            open: 0.12678061315003716,
                                            high: 0.12836499025514422,
                                            low: 0.12403664449646414,
                                            close: 0.12422606595970508,
                                            volume: 0.029977608000000003,
                                            uaw: 1,
                                            transactions: 9,
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
        stablecoin_contracts: [...stables],
        db_dex: dbDex.database,
        db_metadata: dbMetadata.database,
        db_accounts: dbAccounts.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
