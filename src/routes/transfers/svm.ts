import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config.js';
import { handleUsageQueryError, makeUsageQueryJson } from '../../handleQuery.js';
import { nativeMintRedirect } from '../../middleware/nativeContractRedirect.js';
import {
    apiUsageResponseSchema,
    blockNumberSchema,
    createQuerySchema,
    dateTimeSchema,
    svmAddressSchema,
    svmAuthoritySchema,
    svmMintSchema,
    svmNetworkIdSchema,
    svmSPLTokenProgramIdSchema,
    svmTokenAccountSchema,
    svmTransactionSchema,
    timestampSchema,
} from '../../types/zod.js';
import { validatorHook, withErrorResponses } from '../../utils.js';
import query from './svm.sql' with { type: 'text' };

const querySchema = createQuerySchema({
    network: { schema: svmNetworkIdSchema },

    signature: {
        schema: svmTransactionSchema,
        batched: true,
        optional: true,
        meta: { example: '4Xj7G5UWDKWbPEKTMie8adzPD27qGRYLE9hpYwuad228Tw96aVBMqhc4XG5daAeLrJXGAqRnQw8Cbi129dQfynAd' },
    },
    // address: { schema: svmTokenAccountSchema, batched: true, default: '' },
    mint: {
        schema: svmMintSchema,
        batched: true,
        optional: true,
        meta: { example: 'So11111111111111111111111111111111111111112' },
    },
    source: {
        schema: svmTokenAccountSchema,
        batched: true,
        optional: true,
        meta: { example: 'HuxWhQJLCvuuSzHuBkHX1PVJ2LrpVz8GnTCaEkMRKgM1' },
    },
    destination: {
        schema: svmTokenAccountSchema,
        batched: true,
        optional: true,
        meta: { example: 'AtpmmidnYUTC1w62zHXfeXygDFQG8H2CU2fseFLwHiat' },
    },
    program_id: {
        schema: svmSPLTokenProgramIdSchema,
        batched: true,
        optional: true,
    },
    authority: {
        schema: svmAuthoritySchema,
        batched: true,
        optional: true,
        meta: { example: 'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe' },
    },
    fee_payer: {
        schema: svmTokenAccountSchema,
        batched: true,
        optional: true,
        meta: { example: '3ghZcDUBHDGbgKPzmNnDXpAPb7gp2ApfkRtPWqRrGNTo' },
    },
    signer: {
        schema: svmTokenAccountSchema,
        batched: true,
        optional: true,
        meta: { example: '3ghZcDUBHDGbgKPzmNnDXpAPb7gp2ApfkRtPWqRrGNTo' },
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
            signer: svmAddressSchema,
            signers: z.array(svmAddressSchema),

            // -- fees --
            fee: z.number(),
            compute_units_consumed: z.number(),

            // -- transfer --
            program_id: svmSPLTokenProgramIdSchema,
            mint: svmMintSchema,
            source: svmAddressSchema,
            destination: svmAddressSchema,

            // -- authority --
            authority: svmAuthoritySchema,
            multisig_authority: z.array(svmAuthoritySchema),

            // -- amount --
            amount: z.string(),
            value: z.number().describe('Decimal-scaled token amount (= amount / 10^decimals). Not a USD value.'),
            decimals: z.number().nullable(),

            // -- token metadata --
            name: z.string().nullable(),
            symbol: z.string().nullable(),
            uri: z.string().nullable(),
            metadata: z.string().nullable(),

            // -- chain --
            network: svmNetworkIdSchema,
        })
    ),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'Token Transfers',
        description: 'Returns SPL token transfers with program, authority, and account information.',

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
                                            block_num: 413069155,
                                            datetime: '2026-04-14 02:08:00',
                                            timestamp: 1776132480,
                                            signature:
                                                '2HZjoVC9q35EoBDn8z6DfE7jtiua4cZiqBtmpc86cXTF1EoRwK8JPQM9SbTPMhnBMsTk32jtcGQ3sgpKCDK8jULv',
                                            transaction_index: 171,
                                            instruction_index: 2,
                                            stack_height: 2,
                                            fee_payer: '3ghZcDUBHDGbgKPzmNnDXpAPb7gp2ApfkRtPWqRrGNTo',
                                            signer: '3ghZcDUBHDGbgKPzmNnDXpAPb7gp2ApfkRtPWqRrGNTo',
                                            signers: ['3ghZcDUBHDGbgKPzmNnDXpAPb7gp2ApfkRtPWqRrGNTo'],
                                            fee: 5000,
                                            compute_units_consumed: 55785,
                                            program_id: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
                                            mint: 'So11111111111111111111111111111111111111112',
                                            source: 'AtpmmidnYUTC1w62zHXfeXygDFQG8H2CU2fseFLwHiat',
                                            destination: 'GMKAWHL8TKcaDEHoCEkqxSS9QxCppZStXqdF4p4sbLhu',
                                            authority: '3ghZcDUBHDGbgKPzmNnDXpAPb7gp2ApfkRtPWqRrGNTo',
                                            multisig_authority: [],
                                            amount: '1947170680',
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

    const dbTransfers = config.transfersDatabases[params.network];
    const dbMetadata = config.metadataDatabases[params.network];
    const dbAccounts = config.accountsDatabases[params.network];

    if (!dbTransfers || !dbMetadata || !dbAccounts) {
        return c.json({ error: `Network not found: ${params.network}` }, 400);
    }

    const response = await makeUsageQueryJson(c, [query], {
        ...params,
        db_transfers: dbTransfers.database,
        db_metadata: dbMetadata.database,
        db_accounts: dbAccounts.database,
    });
    return handleUsageQueryError(c, response);
});

export default route;
