import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config, EXCLUDED_EVM_PROTOCOLS } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import { stables } from '../../registry/stables.js';
import { EVM_POOL_USDC_WETH_EXAMPLE } from '../../types/examples.js';
import {
    apiUsageResponseSchema,
    createQuerySchema,
    dateTimeSchema,
    evmIntervalSchema,
    evmNetworkIdSchema,
    evmPoolSchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './evm.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    network: { schema: evmNetworkIdSchema },

    pool: { schema: evmPoolSchema, meta: { example: EVM_POOL_USDC_WETH_EXAMPLE } },
    interval: { schema: evmIntervalSchema, prefault: '1d' },
    start_time: { schema: timestampSchema, optional: true },
    end_time: { schema: timestampSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            datetime: dateTimeSchema,
            ticker: z.string(),
            pool: evmPoolSchema,
            open: z.number(),
            high: z.number(),
            low: z.number(),
            close: z.number(),
            volume: z.number(),
            transactions: z.number(),
            network: evmNetworkIdSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Pool OHLCV',
        description:
            'Returns OHLCV price candles for DEX liquidity pools.\n\nHistorical depth is subject to plan restrictions.',
        tags: ['EVM DEXs'],
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
                                            datetime: '2025-10-16 00:00:00',
                                            ticker: 'USDCWETH',
                                            pool: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
                                            open: 3986.8562193110524,
                                            high: 4067.092237083535,
                                            low: 3959.52075942394,
                                            close: 3989.7646037044765,
                                            volume: 32956701.586648002,
                                            transactions: 3066,
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

    const dbDex = config.dexesDatabases[params.network];

    if (!dbDex) {
        return c.json({ error: `Network not found: ${params.network}` }, 400);
    }

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        stablecoin_contracts: [...stables],
        db_dex: dbDex.database,
        excluded_protocols: EXCLUDED_EVM_PROTOCOLS,
    });
    return handleUsageQueryError(c, response);
});

export default route;
