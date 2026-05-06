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
    hyperliquidVaultSortBySchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import baseQuery from './vaults.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    vault: { schema: evmAddressSchema, optional: true },
    sort_by: { schema: hyperliquidVaultSortBySchema, prefault: 'lifetime_deposits' },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            vault: z.string(),
            leader: z.string().nullable(),
            created_at: dateTimeSchema.nullable(),
            initial_deposit: z.number(),
            create_fee: z.number(),
            lifetime_deposits: z.number(),
            lifetime_withdrawals: z.number(),
            lifetime_distributions: z.number(),
            lifetime_leader_commissions: z.number(),
            depositor_count: z.number().int(),
            deposit_count: z.number().int(),
            withdrawal_count: z.number().int(),
            last_activity_at: dateTimeSchema.nullable(),
        })
    ),
});

const SORT_COLUMN_MAP: Record<string, string> = {
    lifetime_deposits: 'lifetime_deposits',
    lifetime_withdrawals: 'lifetime_withdrawals',
    lifetime_distributions: 'lifetime_distributions',
    depositor_count: 'depositor_count',
    last_activity_at: 'last_activity_at',
};

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Vault Listings',
        description:
            'Returns vault summaries — leader, lifetime flow totals (deposits, withdrawals, distributions, leader commissions), depositor and event counts, and last-activity timestamp.\n\nVault trading PnL/volume is exposed via `/v1/hyperliquid/users` with the vault address as `user` (vaults trade as normal accounts on Hyperliquid). Per-depositor breakdowns live on `/v1/hyperliquid/vaults/depositors`.\n\nVaults predating our indexer cutover (2026-02-02) have no `ledger_vault_creates` row and come back with `leader`/`created_at` as null and `initial_deposit`/`create_fee` as 0.',
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
                                            vault: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303',
                                            leader: null,
                                            created_at: null,
                                            initial_deposit: 0,
                                            create_fee: 0,
                                            lifetime_deposits: 434257950.87,
                                            lifetime_withdrawals: 363605603.15,
                                            lifetime_distributions: 0,
                                            lifetime_leader_commissions: 0,
                                            depositor_count: 9088,
                                            deposit_count: 14829,
                                            withdrawal_count: 12601,
                                            last_activity_at: '2026-04-30 22:59:21',
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

    const sortColumn = SORT_COLUMN_MAP[params.sort_by] ?? 'lifetime_deposits';
    const sql = baseQuery.replace('ORDER BY lifetime_deposits DESC', `ORDER BY ${sortColumn} DESC`);

    const response = await makeUsageQueryJson(c, [sql], {
        ...params,
        network: 'hyperliquid',
        db_hypercore: hypercore.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
