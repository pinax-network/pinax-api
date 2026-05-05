import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import { SVM_ADDRESS_USER_EXAMPLE, SVM_MINT_USDC_EXAMPLE } from '../../types/examples.js';
import {
    apiUsageResponseSchema,
    blockNumberSchema,
    createQuerySchema,
    dateTimeSchema,
    svmAddressSchema,
    svmAmmPoolSchema,
    svmAmmSchema,
    svmMintSchema,
    svmNetworkIdSchema,
    svmProgramIdSchema,
    svmProtocolSchema,
    svmTokenResponseSchema,
    svmTransactionSchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';

import query from './svm.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    network: { schema: svmNetworkIdSchema },

    signature: { schema: svmTransactionSchema, batched: true, optional: true },
    amm: { schema: svmAmmSchema, batched: true, optional: true },
    amm_pool: { schema: svmAmmPoolSchema, batched: true, optional: true, meta: { example: '' } },
    user: { schema: svmAddressSchema, batched: true, optional: true, meta: { example: SVM_ADDRESS_USER_EXAMPLE } },
    fee_payer: { schema: svmAddressSchema, batched: true, optional: true },
    signer: { schema: svmAddressSchema, batched: true, optional: true },
    input_mint: {
        schema: svmMintSchema,
        batched: true,
        optional: true,
        meta: { example: 'HmrzeZapM1EygFc4tBJUXwWTzv5Ahy8axLSAadBx51sw' },
    },
    protocol: { schema: svmProtocolSchema, optional: true },

    output_mint: { schema: svmMintSchema, batched: true, optional: true, meta: { example: SVM_MINT_USDC_EXAMPLE } },
    program_id: { schema: svmProgramIdSchema, batched: true, optional: true },

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
            signature: svmTransactionSchema,
            transaction_index: z.number(),
            instruction_index: z.number(),
            stack_height: z.number(),
            fee_payer: svmAddressSchema,
            signer: svmAddressSchema,
            signers: z.array(svmAddressSchema),

            // -- fee --
            fee: z.number(),
            compute_units_consumed: z.number(),

            // -- amm pool --
            program_id: svmProgramIdSchema,
            program_name: z.string(),
            amm: svmAmmSchema,
            amm_pool: svmAmmPoolSchema,

            // -- tokens --
            input_token: svmTokenResponseSchema,
            output_token: svmTokenResponseSchema,

            // -- swap --
            user: svmAddressSchema,
            input_mint: svmMintSchema,
            input_amount: z.string(),
            input_value: z.number(),
            output_mint: svmMintSchema,
            output_amount: z.string(),
            output_value: z.number(),
            protocol: svmProtocolSchema,
            summary: z.string(),

            // -- chain --
            network: svmNetworkIdSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Swap Events',
        description: 'Returns AMM swap events from Solana DEXs with input/output tokens and amounts.',

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
                                            block_num: 413234732,
                                            datetime: '2026-04-14 20:14:22',
                                            timestamp: 1776197662,
                                            signature:
                                                '2NJ58GcdxigtZGba2hoodBU88Sb69U7NzF5XM1AgnnUaeNNXVkzmwrNKsm1L5bfgzWuy6qdUmDkDLPd2njpAFY7s',
                                            transaction_index: 5,
                                            instruction_index: 0,
                                            stack_height: 2,
                                            fee_payer: '5sk1rcXG9cJmdEvSa6Z2SwU8JehfvGVzN269yADA248v',
                                            signer: '5sk1rcXG9cJmdEvSa6Z2SwU8JehfvGVzN269yADA248v',
                                            signers: ['5sk1rcXG9cJmdEvSa6Z2SwU8JehfvGVzN269yADA248v'],
                                            fee: 6000,
                                            compute_units_consumed: 104279,
                                            program_id: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
                                            program_name: 'Jupiter Aggregator v6',
                                            amm: 'HpNfyc2Saw7RKkQd8nEL4khUcuPhQ7WwY1B2qjx8jxFq',
                                            amm_pool: '',
                                            input_token: {
                                                address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                                                symbol: 'USDC',
                                                decimals: 6,
                                            },
                                            output_token: {
                                                address: 'So11111111111111111111111111111111111111112',
                                                symbol: 'SOL',
                                                decimals: 9,
                                            },
                                            user: '5sk1rcXG9cJmdEvSa6Z2SwU8JehfvGVzN269yADA248v',
                                            input_mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                                            input_amount: '11880',
                                            input_value: 0.01188,
                                            output_mint: 'So11111111111111111111111111111111111111112',
                                            output_amount: '141217',
                                            output_value: 0.000141217,
                                            protocol: 'jupiter_v6',
                                            summary: 'Swap 0.01188 USDC for 0.000141217 SOL on Jupiter V6',
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
