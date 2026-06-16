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
    evmAddressSchema,
    hyperliquidVaultDepositorSortBySchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import baseQuery from './vaults_depositors.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    vault: { schema: evmAddressSchema, batched: true },
    sort_by: { schema: hyperliquidVaultDepositorSortBySchema, prefault: 'deposits' },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            user: z.string(),
            vault: evmAddressSchema,
            deposits: z.number(),
            deposit_count: z.number().int(),
            withdrawals: z.number(),
            withdrawal_count: z.number().int(),
            distributions_received: z.number(),
            last_activity_at: dateTimeSchema,
        })
    ),
});

const SORT_COLUMN_MAP: Record<string, string> = {
    deposits: 'deposits',
    withdrawals: 'withdrawals',
    distributions_received: 'distributions_received',
    last_activity_at: 'last_activity_at',
};

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Vault Depositors',
        description:
            'Returns the per-depositor breakdown for a single vault, with one row per `(user, vault)` pair: lifetime deposits, lifetime net withdrawals (after vault commission and closing cost), distributions received, deposit and withdrawal counts, and last-activity timestamp.\n\nFor the vault-level summary, see `/v1/hyperliquid/vaults`.',
        tags: ['Hyperliquid Vaults'],
        security: [{ bearerAuth: [] }],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': {
                        schema: resolver(responseSchema),
                        examples: {
                            default: {
                                value: {
                                    data: [
                                        {
                                            user: '0xa97d92e993f487d4cdbdb381c77972d4fc3b39dd',
                                            vault: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303',
                                            deposits: 1423386.01,
                                            deposit_count: 12,
                                            withdrawals: 885623.07,
                                            withdrawal_count: 5,
                                            distributions_received: 0,
                                            last_activity_at: '2026-04-29 11:42:29',
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

    const hypercore = config.hypercoreDatabases.hyperliquid;
    if (!hypercore) {
        return c.json({ error: 'Hyperliquid not configured' }, 500);
    }

    const sortColumn = SORT_COLUMN_MAP[params.sort_by] ?? 'deposits';
    const sql = baseQuery.replace('ORDER BY deposits DESC', `ORDER BY ${sortColumn} DESC`);

    const response = await makeUsageQueryJson(c, [sql], {
        ...params,
        network: 'hyperliquid',
        db_hypercore: hypercore.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
