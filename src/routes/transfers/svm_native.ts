import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import {
    apiUsageResponseSchema,
    blockNumberSchema,
    createQuerySchema,
    dateTimeSchema,
    svmAddressSchema,
    svmNetworkIdSchema,
    svmTokenAccountSchema,
    svmTransactionSchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './svm_native.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    network: { schema: svmNetworkIdSchema },

    signature: {
        schema: svmTransactionSchema,
        batched: true,
        optional: true,
        meta: { example: '5wzpiQF3tjfyk94V7vpwVSeFBvZk8B7mNXEsBdKcX2cAkgY2m7xFQQ4eas7GHEqVdPHgKc1dJoak89hQP2JwMPjK' },
    },
    // address: { schema: svmTokenAccountSchema, batched: true, default: '' },
    source: {
        schema: svmTokenAccountSchema,
        batched: true,
        optional: true,
        meta: { example: 'BMnT51N4iSNhWU5PyFFgWwFvN1jgaiiDr9ZHgnkm3iLJ' },
    },
    destination: {
        schema: svmTokenAccountSchema,
        batched: true,
        optional: true,
        meta: { example: 'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe' },
    },
    fee_payer: {
        schema: svmTokenAccountSchema,
        batched: true,
        optional: true,
        meta: { example: 'BMnT51N4iSNhWU5PyFFgWwFvN1jgaiiDr9ZHgnkm3iLJ' },
    },
    signer: {
        schema: svmTokenAccountSchema,
        batched: true,
        optional: true,
        meta: { example: 'BMnT51N4iSNhWU5PyFFgWwFvN1jgaiiDr9ZHgnkm3iLJ' },
    },
    start_time: { schema: timestampSchema, optional: true },
    end_time: { schema: timestampSchema, optional: true },
    start_block: { schema: blockNumberSchema, optional: true },
    end_block: { schema: blockNumberSchema, optional: true },
});

const responseSchema = apiUsageResponseSchema.extend({
    data: z.array(
        z.object({
            // -- block --
            block_num: z.number(),
            datetime: dateTimeSchema,
            timestamp: z.number(),

            // -- transaction --
            signature: z.string(),
            transaction_index: z.number(),
            instruction_index: z.number(),
            stack_height: z.number(),
            fee_payer: svmAddressSchema,
            signer: svmAddressSchema,
            signers: z.array(svmAddressSchema),

            // -- fees --
            fee: z.number(),
            compute_units_consumed: z.number(),

            // -- instruction --
            program_id: svmAddressSchema.meta({ example: '11111111111111111111111111111111' }),
            mint: svmAddressSchema.meta({ example: 'So11111111111111111111111111111111111111111' }),

            // -- transfer --
            source: svmAddressSchema,
            destination: svmAddressSchema,

            // -- amounts --
            amount: z.string(),
            value: z.number().describe('Decimal-scaled token amount (= amount / 10^decimals). Not a USD value.'),
            decimals: z.number().nullable(),

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
        summary: 'Native Transfers',
        description: 'Returns Native transfers with transaction and block data.',
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
                                            block_num: 411665924,
                                            datetime: '2026-04-07 16:17:08',
                                            timestamp: 1775578628,
                                            signature:
                                                '5wzpiQF3tjfyk94V7vpwVSeFBvZk8B7mNXEsBdKcX2cAkgY2m7xFQQ4eas7GHEqVdPHgKc1dJoak89hQP2JwMPjK',
                                            transaction_index: 409,
                                            instruction_index: 0,
                                            stack_height: 0,
                                            program_id: '11111111111111111111111111111111',
                                            source: 'BMnT51N4iSNhWU5PyFFgWwFvN1jgaiiDr9ZHgnkm3iLJ',
                                            destination: 'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
                                            fee_payer: 'BMnT51N4iSNhWU5PyFFgWwFvN1jgaiiDr9ZHgnkm3iLJ',
                                            signer: 'BMnT51N4iSNhWU5PyFFgWwFvN1jgaiiDr9ZHgnkm3iLJ',
                                            signers: ['BMnT51N4iSNhWU5PyFFgWwFvN1jgaiiDr9ZHgnkm3iLJ'],
                                            amount: '4182522',
                                            value: 0.004182522,
                                            decimals: 9,
                                            name: 'Native',
                                            symbol: 'SOL',
                                            fee: 5000,
                                            compute_units_consumed: 27160,
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

    const dbTransfers = config.transfersDatabases[params.network];

    if (!dbTransfers) {
        return c.json({ error: `Network not found: ${params.network}` }, 400);
    }

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        db_transfers: dbTransfers.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
