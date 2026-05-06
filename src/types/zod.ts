import { z } from 'zod';
import { config, DEFAULT_LIMIT } from '../config.js';
import {
    EVM_ADDRESS_VITALIK_EXAMPLE,
    EVM_CONTRACT_WETH_EXAMPLE,
    EVM_FACTORY_UNISWAP_V2_EXAMPLE,
    EVM_POOL_USDC_WETH_EXAMPLE,
    EVM_TOKEN_ID_PUDGY_PENGUIN_EXAMPLE,
    EVM_TRANSACTION_SWAP_EXAMPLE,
    SVM_ADDRESS_OWNER_EXAMPLE,
    SVM_ADDRESS_WSOL_EXAMPLE,
    SVM_AMM_POOL_PUMP_EXAMPLE,
    SVM_AMM_RAYDIUM_V4_EXAMPLE,
    SVM_AUTHORITY_USER_EXAMPLE,
    SVM_MINT_PUMP_EXAMPLE,
    SVM_TRANSACTION_SWAP_EXAMPLE,
    TVM_ADDRESS_JUSTIN_SUN_EXAMPLE,
    TVM_CONTRACT_USDT_EXAMPLE,
    TVM_FACTORY_SUNSWAP_EXAMPLE,
    TVM_POOL_USDT_WTRX_EXAMPLE,
    TVM_TRANSACTION_TRANSFER_EXAMPLE,
} from './examples.js';

// ----------------------
// Base Validation Schemas (composable primitives)
// ----------------------

export const booleanFromString = z.preprocess((val, ctx) => {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (typeof val === 'boolean') return val;

    // Invalid value
    ctx.addIssue({
        code: 'custom',
        message: 'Must be `true` or `false`',
    });

    return z.NEVER;
}, z.boolean());

const EVM_ADDRESS_RE = /^(0[xX])?[0-9a-fA-F]{40}$/;
const EVM_TX_RE = /^(0[xX])?[0-9a-fA-F]{64}$/;
const SVM_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SVM_SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{87,88}$/;
const TVM_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const TVM_TX_RE = /^[0-9a-fA-F]{64}$/;

export const evmAddress = z.coerce
    .string()
    .refine((val) => EVM_ADDRESS_RE.test(val), 'Invalid EVM address')
    .transform((addr) => addr.toLowerCase())
    .transform((addr) => (addr.length === 40 ? `0x${addr}` : addr))
    .pipe(z.string())
    .meta({ type: 'string', format: 'evm-address', pattern: EVM_ADDRESS_RE.source });

export const evmTransaction = z.coerce
    .string()
    .refine((val) => EVM_TX_RE.test(val), 'Invalid EVM transaction')
    .transform((addr) => addr.toLowerCase())
    .transform((addr) => (addr.length === 64 ? `0x${addr}` : addr))
    .pipe(z.string())
    .meta({ type: 'string', format: 'evm-tx-hash', pattern: EVM_TX_RE.source });

export const svmAddress = z.coerce
    .string()
    .refine((val) => SVM_ADDRESS_RE.test(val), 'Invalid SVM address')
    .pipe(z.string())
    .meta({ type: 'string', format: 'svm-address', pattern: SVM_ADDRESS_RE.source });

export const svmTransaction = z.coerce
    .string()
    .refine((val) => SVM_SIGNATURE_RE.test(val), 'Invalid SVM transaction')
    .pipe(z.string())
    .meta({ type: 'string', format: 'svm-signature', pattern: SVM_SIGNATURE_RE.source });

export const tvmAddress = z.coerce
    .string()
    .refine((val) => TVM_ADDRESS_RE.test(val), 'Invalid TVM address')
    .pipe(z.string())
    .meta({ type: 'string', format: 'tvm-address', pattern: TVM_ADDRESS_RE.source });

export const tvmTransaction = z.coerce
    .string()
    .refine((val) => TVM_TX_RE.test(val), 'Invalid TVM transaction hash')
    .transform((hash) => hash.toLowerCase())
    .pipe(z.string())
    .meta({ type: 'string', format: 'tvm-tx-hash', pattern: TVM_TX_RE.source });

export const version = z.coerce.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
export const commit = z.coerce.string().regex(/^[0-9a-f]{7}$/);
// Use custom regex for validation both ISO datetimes (T/Z format) and SQL datetimes (spaces)
// e.g. 2025-01-01T12:00:00.000Z / 2025-01-01 12:00:00
export const dateTimeSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/, 'Invalid datetime format');

// Type exports
export type EvmAddress = z.infer<typeof evmAddress>;
export type EvmTransaction = z.infer<typeof evmTransaction>;
export type SvmAddress = z.infer<typeof svmAddress>;
export type SvmTransaction = z.infer<typeof svmTransaction>;
export type TvmAddress = z.infer<typeof tvmAddress>;
export type TvmTransaction = z.infer<typeof tvmTransaction>;
export type Version = z.infer<typeof version>;
export type Commit = z.infer<typeof commit>;

// ----------------------
// Network Schemas
// ----------------------

export const evmNetworkIdSchema = z
    .enum([config.evmNetworks.at(0) ?? config.defaultEvmNetwork, ...config.evmNetworks.slice(1)])
    .meta({
        description: 'The Graph Network ID for EVM networks https://thegraph.com/networks',
        example: config.defaultEvmNetwork,
    });

export const svmNetworkIdSchema = z
    .enum([config.svmNetworks.at(0) ?? config.defaultSvmNetwork, ...config.svmNetworks.slice(1)])
    .meta({
        description: 'The Graph Network ID for SVM networks https://thegraph.com/networks',
        example: config.defaultSvmNetwork,
    });

export const tvmNetworkIdSchema = z
    .enum([config.tvmNetworks.at(0) ?? config.defaultTvmNetwork, ...config.tvmNetworks.slice(1)])
    .meta({
        description: 'The Graph Network ID for TVM networks https://thegraph.com/networks',
        example: config.defaultTvmNetwork,
    });

// ----------------------
// Protocol Schemas
// ----------------------

export const evmProtocolSchema = z
    .enum([
        'uniswap_v1',
        'uniswap_v2',
        'uniswap_v3',
        'uniswap_v4',
        'curvefi',
        'balancer',
        'bancor',
        'cow',
        'aerodrome',
        'dodo',
        'woofi',
        'traderjoe',
        'kyber_elastic',
    ])
    .meta({ description: 'Protocol name', example: 'uniswap_v3' });

const svmProtocolsWithoutAggregators = [
    'pumpfun',
    'pumpfun_amm',
    'raydium_amm_v4',
    'raydium_clmm',
    'raydium_cpmm',
    'raydium_launchpad',
    'meteora_daam',
    'meteora_dlmm',
    'meteora_amm',
    'orca_whirlpool',
    'boop',
    'byreal',
    'darklake',
    'dumpfun',
    'moonshot',
    'pancakeswap',
] as const;

const svmProtocols = ['jupiter_v4', 'jupiter_v6', ...svmProtocolsWithoutAggregators] as const;

export const svmProtocolWithoutAggregatorSchema = z
    .enum(svmProtocolsWithoutAggregators)
    .meta({ description: 'Protocol name', example: 'raydium_amm_v4' });

export const svmProtocolSchema = z.enum(svmProtocols).meta({ description: 'Protocol name', example: 'raydium_amm_v4' });

export const tvmProtocolSchema = z
    .enum(['uniswap_v1', 'uniswap_v2', 'uniswap_v3', 'uniswap_v4', 'sunpump'])
    .meta({ description: 'Protocol name', example: 'uniswap_v2' });

// ----------------------
// Common Query Parameter Schemas
// ----------------------

export const limitSchema = z.coerce.number().int().min(1).max(config.maxLimit).default(DEFAULT_LIMIT).optional().meta({
    description: 'Number of items* returned in a single request.<br>*Plan restricted.',
});

export const pageSchema = z.coerce
    .number()
    .int()
    .min(1)
    .max(Math.floor(767465558638592 / config.maxLimit))
    .default(1)
    .optional()
    .meta({ description: 'Page number to fetch.<br>Empty `data` array signifies end of results.' });

const intervals = ['1h', '4h', '1d', '1w'] as const;
export const intervalSchema = z
    .enum(intervals)
    .transform((interval: string, ctx) => {
        switch (interval) {
            case '1h':
                return 60;
            case '4h':
                return 240;
            case '1d':
                return 1440;
            case '1w':
                return 10080;
            default:
                ctx.addIssue({
                    code: 'custom',
                    message: `Invalid 'interval'`,
                });
                return z.NEVER;
        }
    })
    .meta({
        type: 'string',
        enum: intervals,
        default: '1d',
        description:
            'The interval* for which to aggregate price data (hourly, 4-hours, daily or weekly).<br>*Plan restricted.',
    });

const svmIntervals = ['1h', '4h', '1d', '1w'] as const;
export const svmIntervalSchema = z
    .enum(svmIntervals)
    .transform((interval: string, ctx) => {
        switch (interval) {
            case '1h':
                return 60;
            case '4h':
                return 240;
            case '1d':
                return 1440;
            case '1w':
                return 10080;
            default:
                ctx.addIssue({
                    code: 'custom',
                    message: `Invalid 'interval'`,
                });
                return z.NEVER;
        }
    })
    .meta({
        type: 'string',
        enum: svmIntervals,
        default: '1d',
        description:
            'The interval* for which to aggregate price data (hourly, 4-hours, daily or weekly).<br>*Plan restricted.',
    });

const evmIntervals = ['1m', '5m', '10m', '30m', '1h', '4h', '1d', '1w'] as const;
export const evmIntervalSchema = z
    .enum(evmIntervals)
    .transform((interval: string, ctx) => {
        switch (interval) {
            case '1m':
                return 1;
            case '5m':
                return 5;
            case '10m':
                return 10;
            case '30m':
                return 30;
            case '1h':
                return 60;
            case '4h':
                return 240;
            case '1d':
                return 1440;
            case '1w':
                return 10080;
            default:
                ctx.addIssue({
                    code: 'custom',
                    message: `Invalid 'interval'`,
                });
                return z.NEVER;
        }
    })
    .meta({
        type: 'string',
        enum: evmIntervals,
        default: '1d',
        description:
            'The interval* for which to aggregate price data (1-minute, 5-minutes, 10-minutes, 30-minutes, hourly, 4-hours, daily or weekly).<br>*Plan restricted.',
    });

export const timestampSchema = z
    .string()
    .transform((input, ctx) => {
        // Try to parse as a number first (UNIX timestamp)
        const asNumber = Number(input);
        if (!Number.isNaN(asNumber) && input.trim() !== '') {
            // It's a valid number, treat as UNIX timestamp
            if (asNumber < 0 || asNumber > Number.MAX_SAFE_INTEGER) {
                ctx.addIssue({
                    code: 'custom',
                    message: 'Timestamp must be a valid UNIX timestamp in seconds',
                });
                return z.NEVER;
            }

            const date = new Date(asNumber * 1000);
            if (Number.isNaN(date.getTime())) {
                ctx.addIssue({
                    code: 'custom',
                    message: 'Invalid timestamp',
                });
                return z.NEVER;
            }

            return asNumber;
        }

        // Try to parse as a date string
        const date = new Date(input);
        if (Number.isNaN(date.getTime())) {
            ctx.addIssue({
                code: 'custom',
                message: 'Invalid date string',
            });
            return z.NEVER;
        }

        const timestamp = Math.floor(date.getTime() / 1000);

        if (timestamp < 0 || timestamp > Number.MAX_SAFE_INTEGER) {
            ctx.addIssue({
                code: 'custom',
                message: 'Timestamp must be a valid UNIX timestamp in seconds',
            });
            return z.NEVER;
        }

        return timestamp;
    })
    .meta({
        type: 'string',
        description: 'UNIX timestamp in seconds or date string (e.g. "2025-01-01T00:00:00Z", "2025-01-01", ...).',
    });

export const blockNumberSchema = z.coerce.number().int().min(0).meta({ description: 'Filter by block number' });
export const includeNullBalancesSchema = booleanFromString.meta({
    description: 'Include zero/null balances in results',
});

// ----------------------
// NFT Schemas
// ----------------------

export const nftTokenIdSchema = z.coerce
    .string()
    .refine((val) => /^(\d+|)$/.test(val), 'Invalid Token ID')
    .meta({ description: 'Token ID', type: 'string', example: EVM_TOKEN_ID_PUDGY_PENGUIN_EXAMPLE });

export const nftTokenStandardSchema = z
    .enum(['ERC721', 'ERC1155'])
    .meta({ description: 'Token standard', example: 'ERC721' });

export const nftTransferTypeSchema = z
    .enum(['BURN', 'MINT', 'TRANSFER'])
    .meta({ description: 'Transfer category', example: 'TRANSFER' });

// ----------------------
// Composable Field Schemas (EVM)
// ----------------------

// Address-based fields (all use evmAddress as base)
export const evmContractSchema = evmAddress.meta({
    description: 'Filter by contract address',
    example: EVM_CONTRACT_WETH_EXAMPLE,
});

export const evmAddressSchema = evmAddress.meta({
    description: 'Filter by address',
    example: EVM_ADDRESS_VITALIK_EXAMPLE,
});

export const evmPoolSchema = z
    .union([evmAddress, evmTransaction])
    .transform((addr) => addr.toLowerCase())
    .transform((addr) => (addr.length === 40 || addr.length === 64 ? `0x${addr}` : addr))
    .meta({
        description: 'Filter by pool address',
        type: 'string',
        example: EVM_POOL_USDC_WETH_EXAMPLE,
    });

export const evmFactorySchema = evmAddress.meta({
    description: 'Filter by factory address',
    example: EVM_FACTORY_UNISWAP_V2_EXAMPLE,
});

export const evmTransactionSchema = evmTransaction.meta({
    description: 'Filter by transaction hash',
    example: EVM_TRANSACTION_SWAP_EXAMPLE,
});

// ----------------------
// Composable Field Schemas (SVM)
// ----------------------

export const svmAddressSchema = svmAddress.meta({
    description: 'Filter by address',
    example: SVM_ADDRESS_WSOL_EXAMPLE,
});

export const svmOwnerSchema = svmAddress.meta({
    description: 'Filter by owner address',
    example: SVM_ADDRESS_OWNER_EXAMPLE,
});

export const svmTokenAccountSchema = svmAddress.meta({
    description: 'Filter by token account address',
});

export const svmMintSchema = svmAddress.meta({
    description: 'Filter by mint address',
    example: SVM_MINT_PUMP_EXAMPLE,
});

export const svmAuthoritySchema = svmAddress.meta({
    description: 'Filter by authority address',
    example: SVM_AUTHORITY_USER_EXAMPLE,
});

export const svmAmmSchema = svmAddress.meta({
    description: 'Filter by AMM address',
    example: SVM_AMM_RAYDIUM_V4_EXAMPLE,
});

export const svmAmmPoolSchema = svmAddress.meta({
    description: 'Filter by AMM pool address',
    example: SVM_AMM_POOL_PUMP_EXAMPLE,
});

export const svmTransactionSchema = svmTransaction.meta({
    description: 'Filter by transaction signature',
    example: SVM_TRANSACTION_SWAP_EXAMPLE,
});

export const svmProgramIdSchema = svmAddress.meta({
    description: 'Filter by program ID',
    example: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
});

export const svmSPLTokenProgramIdSchema = z
    .enum([
        '11111111111111111111111111111111',
        'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    ])
    .meta({ description: 'Filter by SPL token program ID', example: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' });

export const svmMetadataSchema = z.string().nullable().optional();

// ----------------------
// Composable Field Schemas (TVM)
// ----------------------

// Address-based fields (all use evmAddress as base)
export const tvmContractSchema = tvmAddress.meta({
    description: 'Filter by contract address',
    example: TVM_CONTRACT_USDT_EXAMPLE,
});

export const tvmAddressSchema = tvmAddress.meta({
    description: 'Filter by address',
    example: TVM_ADDRESS_JUSTIN_SUN_EXAMPLE,
});

export const tvmPoolSchema = tvmAddress.meta({
    description: 'Filter by pool address',
    type: 'string',
    example: TVM_POOL_USDT_WTRX_EXAMPLE,
});

export const tvmFactorySchema = tvmAddress.meta({
    description: 'Filter by factory address',
    example: TVM_FACTORY_SUNSWAP_EXAMPLE,
});

export const tvmTransactionSchema = tvmTransaction.meta({
    description: 'Filter by transaction hash',
    example: TVM_TRANSACTION_TRANSFER_EXAMPLE,
});

// ----------------------
// Response Schemas
// ----------------------

export const evmTokenResponseSchema = z.object({
    address: evmAddressSchema.nullable(),
    symbol: z.string().nullable(),
    decimals: z.number().nullable(),
});

export const svmTokenResponseSchema = z.object({
    address: svmAddressSchema.nullable(),
    symbol: z.string().nullable(),
    decimals: z.number().nullable(),
});

export const svmMintResponseSchema = z.object({
    address: svmAddressSchema,
    symbol: z.string().nullable(),
    name: z.string().nullable(),
    decimals: z.number().nullable(),
});

export const tvmTokenResponseSchema = z.object({
    address: tvmAddressSchema,
    symbol: z.string(),
    name: z.string(),
    decimals: z.number(),
});

export const paginationQuerySchema = z.object({
    limit: limitSchema,
    page: pageSchema,
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const statisticsResponseSchema = z.object({
    elapsed: z.number().optional(),
    rows_read: z.number().optional(),
    bytes_read: z.number().optional(),
});

export const paginationResponseSchema = z.object({
    previous_page: z.coerce.number().int().min(1),
    current_page: z.coerce.number().int().min(1),
});

export type PaginationSchema = z.infer<typeof paginationResponseSchema>;

export const apiUsageResponseSchema = z.object({
    data: z.array(z.any()),
    statistics: statisticsResponseSchema,
    pagination: paginationResponseSchema,
    results: z.number(),
    request_time: z.string().describe('ISO 8601 datetime string'),
    duration_ms: z.number(),
});

export type ApiUsageResponse = z.infer<typeof apiUsageResponseSchema>;

// ----------------------
// Error Response Schemas
// ----------------------

const baseMessage = z.coerce.string();

const clientErrorCodes = [
    'authentication_failed',
    'bad_header',
    'missing_required_header',
    'bad_query_input',
    'forbidden',
    'method_not_allowed',
    'route_not_found',
    'unauthorized',
    'not_found_data',
] as const;

const serverErrorCodes = [
    'bad_database_response',
    'connection_refused',
    'database_timeout',
    'internal_server_error',
] as const;

export const clientErrorResponseSchema = z.object({
    status: z.union([z.literal(400), z.literal(401), z.literal(403), z.literal(404), z.literal(405)]),
    code: z.enum(clientErrorCodes),
    message: baseMessage,
});

export type ClientErrorResponse = z.infer<typeof clientErrorResponseSchema>;

export const serverErrorResponseSchema = z.object({
    status: z.union([z.literal(500), z.literal(502), z.literal(504)]),
    code: z.enum(serverErrorCodes),
    message: baseMessage,
});

export type ServerErrorResponse = z.infer<typeof serverErrorResponseSchema>;

export const apiErrorResponseSchema = z.union([clientErrorResponseSchema, serverErrorResponseSchema]);
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

// ----------------------
// Helper function for query schema
// ----------------------

/**
 * Configuration object for defining a field in a query schema.
 *
 * @property schema - The base Zod schema to validate the field
 * @property batched - If true, accepts single value, comma-separated string, or array. Output is always an array.
 * @property optional - If true, field becomes optional with null (scalar) or empty array (batched) default. No filter applied when absent.
 * @property default - Default value set at schema output (short-circuits parsing). Field becomes optional.
 * @property prefault - Pre-parse default value set at schema input (does not short-circuit). Field becomes optional.
 * @property separator - Separator for parsing comma-separated strings in batched fields (default: ',')
 * @property meta - Additional metadata to attach to the schema (e.g., description, custom fields)
 *
 * @note Only one of `default`, `prefault`, or `optional` can be set. This is enforced at the type level.
 */
type FieldConfig = {
    schema: z.ZodTypeAny;
    batched?: boolean;
    separator?: string;
    meta?: Record<string, unknown>;
} & (
    | { default: unknown; prefault?: never; optional?: never }
    | { prefault: unknown; default?: never; optional?: never }
    | { optional: true; default?: never; prefault?: never }
    | { default?: never; prefault?: never; optional?: never }
);

/**
 * Infers the processed Zod schema type based on field configuration.
 *
 * Type inference rules:
 * - batched + no default/prefault/optional = z.ZodType<Array<T>> (required array)
 * - batched + has default/prefault/optional = z.ZodDefault<z.ZodType<Array<T>>> (optional array)
 * - not batched + no default/prefault/optional = original schema (required single value)
 * - not batched + has default/prefault/optional = z.ZodDefault<schema> (optional single value)
 *
 * @template T - The field configuration to process
 */
type InferProcessedSchema<T extends FieldConfig> = T['batched'] extends true
    ? T['default'] extends undefined
        ? T['prefault'] extends undefined
            ? T['optional'] extends true
                ? z.ZodDefault<z.ZodType<Array<z.infer<T['schema']>>>>
                : z.ZodType<Array<z.infer<T['schema']>>>
            : z.ZodDefault<z.ZodType<Array<z.infer<T['schema']>>>>
        : z.ZodDefault<z.ZodType<Array<z.infer<T['schema']>>>>
    : T['default'] extends undefined
      ? T['prefault'] extends undefined
          ? T['optional'] extends true
              ? z.ZodDefault<T['schema']>
              : T['schema']
          : z.ZodDefault<T['schema']>
      : z.ZodDefault<T['schema']>;

/**
 * Maps field configurations to their processed Zod schema types.
 *
 * Transforms a record of FieldConfig objects into a record of processed
 * Zod schemas that can be used in z.object().
 *
 * @template T - Record mapping field names to their configurations
 */
type ProcessedFields<T extends Record<string, FieldConfig>> = {
    [K in keyof T]: InferProcessedSchema<T[K]>;
};

// Overload functions to infer right type if pagination is included in the output schema or not
export function createQuerySchema<T extends Record<string, FieldConfig>>(
    definitions: T,
    include_pagination: false
): z.ZodObject<ProcessedFields<T>>;
export function createQuerySchema<T extends Record<string, FieldConfig>>(
    definitions: T,
    include_pagination?: true
): z.ZodObject<ProcessedFields<T> & typeof paginationQuerySchema.shape>;

/**
 * Creates a Zod object schema with automatic field name injection and batching support.
 *
 * This helper function processes field definitions and automatically:
 * - Injects field names into validation error messages
 * - Marks fields as required (no default/prefault/optional) or optional (has default/prefault/optional)
 * - Enables batched input (single value, comma-separated string, or array)
 * - Provides consistent error messages for missing required fields
 *
 * @param definitions - Object mapping field names to config objects with:
 *   - `schema`: The Zod schema to use
 *   - `batched`: Optional boolean, enables array/comma-separated input (default: false)
 *   - `optional`: Optional boolean, makes field optional with null (scalar) or empty array (batched) default
 *   - `default`: Optional default value at output (short-circuits parsing), makes field optional
 *   - `prefault`: Optional default value at input (does not short-circuit), makes field optional
 *   - `separator`: Optional string separator for batched fields (default: ',')
 *   - `meta`: Optional metadata object to attach to the schema (e.g., { description: '...', customField: '...' })
 * @param include_pagination - Choose to include `limit` and `page` to the query parameters
 *
 * @returns Zod object schema for query parameters
 *
 * @example
 * ```ts
 * const querySchema = createQuerySchema({
 *   network: {
 *     schema: svmNetworkIdSchema,
 *     meta: { description: 'The blockchain network to query' }
 *   },
 *   owner: {
 *     schema: svmOwnerSchema,
 *     batched: true,
 *     meta: { description: 'Owner address(es)', customField: 'value' }
 *   },
 *   // Optional batched field (defaults to empty array)
 *   mint: { schema: svmMintSchema, batched: true, optional: true },
 *   // Optional scalar field (defaults to null)
 *   start_time: { schema: timestampSchema, optional: true },
 *   // Using prefault (input-level, goes through parsing)
 *   program_id: { schema: svmProgramIdSchema.trim(), prefault: '  default  ' },
 * });
 * ```
 */
export function createQuerySchema<T extends Record<string, FieldConfig>>(
    definitions: T,
    include_pagination: boolean = true
) {
    const querySchema = z.object(
        Object.fromEntries(
            Object.entries(definitions).map(([fieldName, config]) => {
                const {
                    schema,
                    batched = false,
                    default: defaultValue,
                    prefault: prefaultValue,
                    separator = ',',
                    meta,
                } = config;
                const isOptional = 'optional' in config && config.optional === true;

                let resultSchema = schema;

                // Apply batching if requested
                if (batched) {
                    resultSchema = z
                        .union([
                            schema,
                            z.string().transform((str, ctx) => {
                                const items = str.split(separator).map((item) => item.trim());
                                const parsed: z.infer<typeof schema>[] = [];

                                for (const item of items) {
                                    const result = schema.safeParse(item);
                                    if (!result.success) {
                                        // Add the error to the current parsing context
                                        for (const issue of result.error.issues) {
                                            ctx.addIssue({
                                                ...issue,
                                                message: `Invalid value in ${fieldName}: ${issue.message}`,
                                            });
                                        }
                                        return z.NEVER;
                                    }
                                    parsed.push(result.data);
                                }

                                return parsed;
                            }),
                            z.array(schema),
                        ])
                        .transform((value) => {
                            return Array.isArray(value) ? value : [value];
                        })
                        .meta({
                            ...schema.meta(),
                            description: `${schema.description}<br>Single value or array of values* (separate multiple values with \`${separator}\`)<br>*Plan restricted.`,
                        });
                }

                // If no default, prefault, or optional flag, make it required with proper error message
                if (defaultValue === undefined && prefaultValue === undefined && !isOptional) {
                    resultSchema = z
                        .preprocess((val, ctx) => {
                            if (val === undefined || val === '') {
                                ctx.addIssue({
                                    code: 'invalid_type',
                                    expected: 'string',
                                    received: typeof val,
                                    message: `${fieldName} is required`,
                                });
                                return z.NEVER;
                            }

                            // Check if multiple values provided for non-batched field
                            if (!batched && Array.isArray(val)) {
                                ctx.addIssue({
                                    code: 'custom',
                                    message: `multiple values are not supported on this endpoint. Please provide only a single value.`,
                                });
                                return z.NEVER;
                            }

                            return val;
                        }, resultSchema)
                        .meta({ ...resultSchema.meta() });
                } else if (isOptional) {
                    // Optional field: use empty array for batched, null for scalar
                    const optionalDefault = batched ? [] : null;
                    resultSchema = resultSchema.default(optionalDefault).meta({
                        ...resultSchema.meta(),
                        ...(optionalDefault === null ? { default: undefined } : {}),
                    });
                } else if (defaultValue !== undefined) {
                    // Apply default (output-level) if provided - takes precedence over prefault
                    // For batched fields with null default, use empty array instead of [null]
                    resultSchema = resultSchema
                        .default(batched ? (defaultValue === null ? [] : [defaultValue]) : defaultValue)
                        .optional()
                        .meta({ ...resultSchema.meta(), default: defaultValue });
                } else if (prefaultValue !== undefined) {
                    // Apply prefault (input-level) - value goes through parsing
                    resultSchema = resultSchema
                        .prefault(prefaultValue)
                        .optional()
                        .meta({ ...resultSchema.meta(), default: prefaultValue });
                }

                // Apply custom metadata if provided
                if (meta) resultSchema = resultSchema.meta({ ...resultSchema.meta(), ...meta });

                const description = resultSchema.meta()?.description;
                // Hard-limit on OpenAPI schema description length for GPT agents
                if (description && description.length >= 300)
                    throw new Error(`'${fieldName}' description field has more than 300 characters.`);

                return [fieldName, resultSchema];
            })
        )
    );

    if (include_pagination)
        return querySchema.extend(paginationQuerySchema.shape) as z.ZodObject<
            ProcessedFields<T> & typeof paginationQuerySchema.shape
        >;
    else return querySchema as z.ZodObject<ProcessedFields<T>>;
}

// ── Polymarket Schemas ──

export const polymarketConditionIdSchema = z.coerce
    .string()
    .refine((val) => /^0x[a-fA-F0-9]{64}$/.test(val), 'Invalid condition ID (0x + 64 hex chars)')
    .transform((val) => val.toLowerCase())
    .pipe(z.string())
    .meta({ type: 'string', example: '0x9708334534b504e2025a5a6af92f8600808c10be577e5066f920c40625fbec16' });

export const polymarketTokenIdSchema = z.coerce
    .string()
    .refine((val) => /^\d+$/.test(val), 'Invalid token ID (numeric string)')
    .meta({ type: 'string', example: '53342136288932702007624506186417846874594504126387502748453102780630218207922' });

export const polymarketSlugSchema = z.coerce
    .string()
    .refine((val) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(val), 'Invalid slug')
    .meta({ type: 'string', example: 'will-bitcoin-reach-150k-in-january-2026' });

const polymarketEventTypes = ['trade', 'split', 'merge', 'redeem'] as const;
export const polymarketEventTypeSchema = z.enum(polymarketEventTypes).meta({
    type: 'string',
    enum: polymarketEventTypes,
    description: 'Filter by event type',
});

const polymarketMarketSortFields = ['volume', 'end_date', 'start_date'] as const;
export const polymarketMarketSortBySchema = z.enum(polymarketMarketSortFields).meta({
    type: 'string',
    enum: polymarketMarketSortFields,
    default: 'volume',
});

const polymarketMarketPositionSortFields = [
    'position_value',
    'realized_pnl',
    'unrealized_pnl',
    'total_pnl',
    'pnl_pct',
    'transactions',
    'avg_price',
] as const;
export const polymarketMarketPositionSortBySchema = z.enum(polymarketMarketPositionSortFields).meta({
    type: 'string',
    enum: polymarketMarketPositionSortFields,
    default: 'position_value',
});

const polymarketPositionSortFields = [
    'position_value',
    'realized_pnl',
    'unrealized_pnl',
    'total_pnl',
    'pnl_pct',
    'transactions',
    'avg_price',
    'current_price',
] as const;
export const polymarketPositionSortBySchema = z.enum(polymarketPositionSortFields).meta({
    type: 'string',
    enum: polymarketPositionSortFields,
    default: 'position_value',
});

const polymarketUserSortFields = [
    'total_volume',
    'realized_pnl',
    'unrealized_pnl',
    'total_pnl',
    'transactions',
] as const;
export const polymarketUserSortBySchema = z.enum(polymarketUserSortFields).meta({
    type: 'string',
    enum: polymarketUserSortFields,
    default: 'total_volume',
});

const userLookbackIntervals = ['1h', '1d', '1w', '30d'] as const;
export const userLookbackIntervalSchema = z
    .enum(userLookbackIntervals)
    .transform((v) => ({ '1h': 60, '1d': 1440, '1w': 10080, '30d': 43200 })[v])
    .meta({
        type: 'string',
        enum: userLookbackIntervals,
        description: 'Lookback window for user statistics (1 hour, 1 day, 1 week, 30 days). Omit for all-time.',
    });

// ── Hyperliquid Schemas ──

// `dex` values returned by the substreams `dex_from_coin(coin)` UDF.
// `perps` = unprefixed core perps (BTC, ETH, HYPE, ...). `spot` = `@N`-indexed
// spot pairs. Named DEXs are builder-deployed perp venues with permissionless
// onboarding — represented as an open lowercase-alphanumeric string so new
// builder DEXs work without a release. Discovery is via `/v1/hyperliquid/dexes`.
const knownHyperliquidDexes = ['perps', 'spot', 'xyz', 'cash', 'km', 'hyna', 'flx', 'vntl', 'para'] as const;
export const hyperliquidDexIdSchema = z.coerce
    .string()
    .min(1)
    .refine((val) => /^[a-z0-9]+$/.test(val), 'Invalid DEX id (lowercase alphanumeric only)')
    .meta({
        type: 'string',
        description:
            'DEX identifier. `perps` for core perps, `spot` for `@N` spot pairs, or a builder DEX name (e.g. `xyz`, `cash`). New builder DEXs are added on Hyperliquid permissionlessly — call `/v1/hyperliquid/dexes` for the live set.',
        examples: knownHyperliquidDexes,
    });

const hyperliquidLiquidationSortFields = ['notional', 'time'] as const;
export const hyperliquidLiquidationSortBySchema = z.enum(hyperliquidLiquidationSortFields).meta({
    type: 'string',
    enum: hyperliquidLiquidationSortFields,
    default: 'notional',
});

const hyperliquidVaultSortFields = [
    'lifetime_deposits',
    'lifetime_withdrawals',
    'lifetime_distributions',
    'depositor_count',
    'last_activity_at',
] as const;
export const hyperliquidVaultSortBySchema = z.enum(hyperliquidVaultSortFields).meta({
    type: 'string',
    enum: hyperliquidVaultSortFields,
    default: 'lifetime_deposits',
});

const hyperliquidVaultDepositorSortFields = [
    'deposits',
    'withdrawals',
    'distributions_received',
    'last_activity_at',
] as const;
export const hyperliquidVaultDepositorSortBySchema = z.enum(hyperliquidVaultDepositorSortFields).meta({
    type: 'string',
    enum: hyperliquidVaultDepositorSortFields,
    default: 'deposits',
});

const hyperliquidUserActivityEventTypes = [
    'bridge_deposit',
    'bridge_withdraw_pending',
    'bridge_withdraw_finalized',
    'deposit',
    'withdraw',
    'vault_deposit',
    'vault_withdraw',
    'liquidation',
    'funding',
] as const;
export const hyperliquidUserActivityEventTypeSchema = z.enum(hyperliquidUserActivityEventTypes).meta({
    type: 'string',
    enum: hyperliquidUserActivityEventTypes,
    description: 'Filter by balance-event type.',
});

const hyperliquidUserSortFields = [
    'total_volume',
    'transactions',
    'total_fees',
    'realized_pnl',
    'total_funding',
    'liquidation_fills',
] as const;
export const hyperliquidUserSortBySchema = z.enum(hyperliquidUserSortFields).meta({
    type: 'string',
    enum: hyperliquidUserSortFields,
    default: 'total_volume',
});

export const hyperliquidTokenSchema = z.coerce
    .string()
    .min(1)
    .meta({
        type: 'string',
        description:
            'Spot token symbol (e.g. `HYPE`, `USDC`). Use to discover all spot pairs with this token on a given side via `/v1/hyperliquid/markets?base_token=...` or `?quote_token=...`.',
        examples: ['HYPE', 'USDC', 'PURR'],
    });

export const hyperliquidCoinSchema = z.coerce.string().min(1).meta({
    type: 'string',
    description:
        'Hyperliquid coin identifier. Core perps have no prefix (`BTC`, `HYPE`); spot pairs use `@N` (`@107`); builder DEXs prefix the symbol with the DEX name (`xyz:SILVER`).',
    example: 'BTC',
});
