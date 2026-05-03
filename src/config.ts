import 'dotenv/config';
import { $ } from 'bun';
import { Option, program } from 'commander';
import { z } from 'zod';

import pkg from '../package.json' with { type: 'json' };
import { loadDbsConfig } from './config/dbsConfig.js';

// Set timezone to UTC
process.env.TZ = 'Etc/UTC';

// defaults
export const DEFAULT_PORT = '8000';
export const DEFAULT_HOSTNAME = 'localhost';
export const DEFAULT_URL = 'http://localhost:8123';
export const DEFAULT_API_URL = `http://${DEFAULT_HOSTNAME}:${DEFAULT_PORT}`;
export const DEFAULT_DATABASE = 'default';
export const DEFAULT_USERNAME = 'default';
export const DEFAULT_PASSWORD = '';
export const DEFAULT_MAX_LIMIT = 1000;
export const DEFAULT_LARGE_QUERIES_ROWS_TRIGGER = 10_000_000; // 10M rows
export const DEFAULT_LARGE_QUERIES_BYTES_TRIGGER = 1_000_000_000; // 1Gb
export const DEFAULT_DB_RESPONSE_TIME_TRIGGER_MS = 1000;
export const DEFAULT_IDLE_TIMEOUT = 60;
export const DEFAULT_PRETTY_LOGGING = false;
export const DEFAULT_VERBOSE = false;
export const DEFAULT_SORT_BY = 'DESC';
export const DEFAULT_OHLC_QUANTILE = 0.02;
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 10;
export const DEFAULT_MAX_QUERY_EXECUTION_TIME = 10; // 10 seconds query timeout to match `fetch` MCP timeout
export const DEFAULT_DEFAULT_EVM_NETWORK = 'mainnet';
export const DEFAULT_DEFAULT_SVM_NETWORK = 'solana';
export const DEFAULT_DEFAULT_TVM_NETWORK = 'tron';
export const DEFAULT_LOW_LIQUIDITY_CHECK = 10000; // $10K USD
export const DEFAULT_DISABLE_OPENAPI_SERVERS = false;
export const DEFAULT_SKIP_NETWORKS_VALIDATION = false;
// HTTP Cache-Control defaults (seconds)
export const DEFAULT_CACHE_SERVER_MAX_AGE = 600; // s-maxage for shared/proxy caches
export const DEFAULT_CACHE_MAX_AGE = 60; // max-age for browser caches
export const DEFAULT_CACHE_STALE_WHILE_REVALIDATE = 30; // RFC 5861 stale-while-revalidate window
export const DEFAULT_PLANS = '';
export const DEFAULT_X402_ENABLED = false;
export const DEFAULT_X402_FACILITATOR_URL = 'https://api.cdp.coinbase.com/platform/v2/x402';
export const DEFAULT_X402_EVM_NETWORK = 'eip155:8453';
export const DEFAULT_X402_SVM_NETWORK = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
export const DEFAULT_X402_EVM_PAY_TO = '0x49D581486438aAD93f4114084Ac5B09A8b7C9685';
export const DEFAULT_X402_SVM_PAY_TO = 'EpRR35QnB5PfTczy3j5rp9bCw4NKzHkd8S1ubdza4my9';
export const DEFAULT_X402_PASS_PRICE = '$0.10';
export const DEFAULT_X402_PASS_DURATION_SECONDS = 3600;
export const DEFAULT_X402_PLAN = 'pro';
export const DEFAULT_X402_SYNC_FACILITATOR_ON_START = true;

// GitHub metadata
const GIT_COMMIT = (process.env.GIT_COMMIT ?? (await $`git rev-parse HEAD`.text())).replace(/\n/, '').slice(0, 7);
const GIT_DATE = (process.env.GIT_DATE ?? (await $`git log -1 --format=%cd --date=short`.text())).replace(/\n/, '');
const GIT_REPOSITORY = (process.env.GIT_REPOSITORY ?? (await $`git config --get remote.origin.url`.text()))
    .replace(/git@github.com:/, '')
    .replace('.git', '')
    .replace(/\n/, '');
export const GIT_APP = {
    version: pkg.version as `${number}.${number}.${number}`,
    commit: GIT_COMMIT,
    date: GIT_DATE as `${number}-${number}-${number}`,
    repo: GIT_REPOSITORY,
};
export const APP_NAME = pkg.name;
export const APP_DESCRIPTION = pkg.description;
export const APP_VERSION = `${GIT_APP.version}+${GIT_APP.commit} (${GIT_APP.date})`;

/**
 * Parse plan configuration string into a Map.
 * Format: "name:limit,batched,intervals;name2:limit,batched,intervals"
 * Intervals are pipe-separated: "1m|5m|15m"
 * Returns null if input is empty (bypasses plan limits for local development).
 */
export function parsePlans(val: string) {
    if (!val || val.trim() === '') {
        return null;
    }

    const plans = new Map<
        string,
        {
            maxLimit: number;
            maxBatched: number;
            allowedIntervals: string[];
        }
    >();

    val.split(';').forEach((planDef) => {
        const [name, limits] = planDef.split(':');
        if (!name || !limits) {
            throw new Error(`Malformed plan entry: "${planDef}". Skipping.`);
        }

        // Format: name:limit,batched,intervals
        const parts = limits.split(',');
        if (parts.length !== 3) {
            throw new Error(`Invalid limits format for plan "${name}". Expected 3 values.`);
        }

        const [limit, batched, intervals] = parts;
        const maxLimit = Number(limit);
        const maxBatched = Number(batched);
        const allowedIntervals = intervals ? intervals.split('|').filter((s) => s.length > 0) : [];

        if (Number.isNaN(maxLimit) || Number.isNaN(maxBatched)) {
            throw new Error(`Invalid numeric limits for plan "${name}".`);
        }

        plans.set(name, {
            maxLimit,
            maxBatched,
            allowedIntervals,
        });

        if (!name.startsWith('tgm-')) {
            plans.set(`tgm-${name.toUpperCase()}`, {
                maxLimit,
                maxBatched,
                allowedIntervals,
            });
        }
    });

    return plans;
}

// parse command line options
const opts = program
    .name(pkg.name)
    .version(APP_VERSION)
    .description(APP_DESCRIPTION)
    .showHelpAfterError()
    .addOption(
        new Option('-p, --port <number>', 'HTTP port on which to attach the API').env('PORT').default(DEFAULT_PORT)
    )
    .addOption(
        new Option('--hostname <string>', 'Server listen on HTTP hostname').env('HOSTNAME').default(DEFAULT_HOSTNAME)
    )
    .addOption(new Option('--url <string>', 'Database HTTP hostname').env('URL').default(DEFAULT_URL))
    .addOption(new Option('--api-url <string>', 'API HTTP hostname').env('API_URL').default(DEFAULT_API_URL))
    .addOption(
        new Option('--database <string>', 'The database to use inside ClickHouse')
            .env('DATABASE')
            .default(DEFAULT_DATABASE)
    )
    .addOption(new Option('--username <string>', 'Database user for API').env('USERNAME').default(DEFAULT_USERNAME))
    .addOption(
        new Option('--password <string>', 'Password associated with the specified API username')
            .env('PASSWORD')
            .default(DEFAULT_PASSWORD)
    )
    .addOption(
        new Option('--default-evm-network <string>', 'Default EVM Network ID')
            .env('DEFAULT_EVM_NETWORK')
            .default(DEFAULT_DEFAULT_EVM_NETWORK)
    )
    .addOption(
        new Option('--default-svm-network <string>', 'Default SVM Network ID')
            .env('DEFAULT_SVM_NETWORK')
            .default(DEFAULT_DEFAULT_SVM_NETWORK)
    )
    .addOption(
        new Option('--default-tvm-network <string>', 'Default TVM Network ID')
            .env('DEFAULT_TVM_NETWORK')
            .default(DEFAULT_DEFAULT_TVM_NETWORK)
    )
    .addOption(
        new Option('--ohlc-quantile <number>', 'High and low quantiles for OHLC aggregations')
            .env('OHLC_QUANTILE')
            .default(DEFAULT_OHLC_QUANTILE)
    )
    .addOption(new Option('--max-limit <number>', 'Maximum LIMIT queries').env('MAX_LIMIT').default(DEFAULT_MAX_LIMIT))
    .addOption(
        new Option('--max-query-execution-time <number>', 'Maximum SQL query execution time')
            .env('MAX_QUERY_EXECUTION_TIME')
            .default(DEFAULT_MAX_QUERY_EXECUTION_TIME)
    )
    .addOption(
        new Option(
            '--max-rows-trigger <number>',
            'Queries returning rows above this threshold will be considered large queries for metrics'
        )
            .env('LARGE_QUERIES_ROWS_TRIGGER')
            .default(DEFAULT_LARGE_QUERIES_ROWS_TRIGGER)
    )
    .addOption(
        new Option(
            '--max-bytes-trigger <number>',
            'Queries processing bytes above this threshold will be considered large queries for metrics'
        )
            .env('LARGE_QUERIES_BYTES_TRIGGER')
            .default(DEFAULT_LARGE_QUERIES_BYTES_TRIGGER)
    )
    .addOption(
        new Option(
            '--degraded-db-response-time <number>',
            'Maximum database response time for health check to be considered degraded'
        )
            .env('DB_RESPONSE_TIME_TRIGGER_MS')
            .default(DEFAULT_DB_RESPONSE_TIME_TRIGGER_MS)
    )
    .addOption(
        new Option('--idle-timeout <number>', 'HTTP server request idle timeout (seconds)')
            .env('IDLE_TIMEOUT')
            .default(DEFAULT_IDLE_TIMEOUT)
    )
    .addOption(
        new Option('--disable-openapi-servers <boolean>', 'Disable OpenAPI servers (used for local testing)')
            .choices(['true', 'false'])
            .env('DISABLE_OPENAPI_SERVERS')
            .default(DEFAULT_DISABLE_OPENAPI_SERVERS)
    )
    .addOption(
        new Option(
            '--skip-networks-validation <boolean>',
            'Skip networks databases validation (used for local testing)'
        )
            .choices(['true', 'false'])
            .env('SKIP_NETWORKS_VALIDATION')
            .default(DEFAULT_SKIP_NETWORKS_VALIDATION)
    )
    .addOption(
        new Option('--pretty-logging <boolean>', 'Enable pretty logging (default JSON)')
            .choices(['true', 'false'])
            .env('PRETTY_LOGGING')
            .default(DEFAULT_PRETTY_LOGGING)
    )
    .addOption(
        new Option('-v, --verbose <boolean>', 'Enable verbose logging')
            .choices(['true', 'false'])
            .env('VERBOSE')
            .default(DEFAULT_VERBOSE)
    )
    .addOption(
        new Option('--dbs-config-path <string>', 'Path to database configuration YAML file')
            .env('DBS_CONFIG_PATH')
            .default('dbs-config.yaml')
    )
    .addOption(
        new Option('--disable-cache <boolean>', 'Disable HTTP Cache-Control headers')
            .choices(['true', 'false'])
            .env('CACHE_DISABLE')
            .default(false)
    )
    .addOption(
        new Option('--cache-server-max-age <number>', 's-maxage for shared/proxy caches (seconds)')
            .env('CACHE_SERVER_MAX_AGE')
            .default(DEFAULT_CACHE_SERVER_MAX_AGE)
    )
    .addOption(
        new Option('--cache-max-age <number>', 'max-age for browser caches (seconds)')
            .env('CACHE_MAX_AGE')
            .default(DEFAULT_CACHE_MAX_AGE)
    )
    .addOption(
        new Option('--cache-stale-while-revalidate <number>', 'stale-while-revalidate window (seconds, RFC 5861)')
            .env('CACHE_STALE_WHILE_REVALIDATE')
            .default(DEFAULT_CACHE_STALE_WHILE_REVALIDATE)
    )
    .addOption(
        new Option('--plans <string>', 'Plan configurations (name:limit,batched,intervals)')
            .env('PLANS')
            .default(DEFAULT_PLANS)
    )
    .addOption(
        new Option('--x402-enabled <boolean>', 'Enable x402 access pass payment middleware')
            .choices(['true', 'false'])
            .env('X402_ENABLED')
            .default(DEFAULT_X402_ENABLED)
    )
    .addOption(
        new Option('--x402-facilitator-url <string>', 'x402 facilitator HTTP URL')
            .env('X402_FACILITATOR_URL')
            .default(DEFAULT_X402_FACILITATOR_URL)
    )
    .addOption(
        new Option('--x402-evm-network <string>', 'CAIP-2 EVM network accepted for x402 payments')
            .env('X402_EVM_NETWORK')
            .default(DEFAULT_X402_EVM_NETWORK)
    )
    .addOption(
        new Option('--x402-svm-network <string>', 'CAIP-2 SVM network accepted for x402 payments')
            .env('X402_SVM_NETWORK')
            .default(DEFAULT_X402_SVM_NETWORK)
    )
    .addOption(
        new Option('--x402-evm-pay-to <string>', 'EVM payment recipient for x402 access passes')
            .env('X402_EVM_PAY_TO')
            .default(DEFAULT_X402_EVM_PAY_TO)
    )
    .addOption(
        new Option('--x402-svm-pay-to <string>', 'SVM payment recipient for x402 access passes')
            .env('X402_SVM_PAY_TO')
            .default(DEFAULT_X402_SVM_PAY_TO)
    )
    .addOption(
        new Option('--x402-pass-price <string>', 'USD-denominated x402 access pass price')
            .env('X402_PASS_PRICE')
            .default(DEFAULT_X402_PASS_PRICE)
    )
    .addOption(
        new Option('--x402-pass-duration-seconds <number>', 'x402 access pass duration in seconds')
            .env('X402_PASS_DURATION_SECONDS')
            .default(DEFAULT_X402_PASS_DURATION_SECONDS)
    )
    .addOption(
        new Option('--x402-plan <string>', 'Plan applied to requests with valid x402 payment access')
            .env('X402_PLAN')
            .default(DEFAULT_X402_PLAN)
    )
    .addOption(
        new Option('--x402-sync-facilitator-on-start <boolean>', 'Sync x402 facilitator support before first request')
            .choices(['true', 'false'])
            .env('X402_SYNC_FACILITATOR_ON_START')
            .default(DEFAULT_X402_SYNC_FACILITATOR_ON_START)
    )
    .allowUnknownOption()
    .allowExcessArguments()
    .parse()
    .opts();

const config = z
    .object({
        port: z
            .string()
            .regex(/^\d+$/, 'Port must be numeric')
            .transform(Number)
            .refine((val) => val > 0 && val < 65536, 'Port must be between 1-65535'),
        hostname: z.string().min(1, 'Hostname cannot be empty'),
        url: z.string().url({ message: 'Invalid Database URL' }),
        apiUrl: z.string().url({ message: 'Invalid API URL' }),
        database: z.string().min(1, 'Database name cannot be empty'),
        username: z.string().min(1, 'Username cannot be empty'),
        password: z.string(),
        defaultEvmNetwork: z.string().min(1, 'Default EVM network cannot be empty'),
        defaultSvmNetwork: z.string().min(1, 'Default SVM network cannot be empty'),
        defaultTvmNetwork: z.string().min(1, 'Default TVM network cannot be empty'),
        ohlcQuantile: z.coerce.number().positive('OHLC quantile must be positive'),
        maxLimit: z.coerce.number().positive('Max limit must be positive'),
        maxQueryExecutionTime: z.coerce.number().positive('Max query execution time must be positive'),
        maxRowsTrigger: z.coerce.number().positive('Max rows trigger must be positive'),
        maxBytesTrigger: z.coerce.number().positive('Max bytes trigger must be positive'),
        degradedDbResponseTime: z.coerce.number().positive('Max response time must be positive'),
        idleTimeout: z.coerce.number().nonnegative('Idle timeout must be non-negative'),
        // `z.coerce.boolean` doesn't parse boolean string values as expected (see https://github.com/colinhacks/zod/issues/1630)
        prettyLogging: z.coerce.string().transform((val) => val.toLowerCase() === 'true'),
        disableOpenapiServers: z.coerce.string().transform((val) => val.toLowerCase() === 'true'),
        cacheDisable: z.coerce.string().transform((val) => val.toLowerCase() === 'true'),
        skipNetworksValidation: z.coerce.string().transform((val) => val.toLowerCase() === 'true'),
        verbose: z.coerce.string().transform((val) => val.toLowerCase() === 'true'),
        dbsConfigPath: z.string().optional(),
        cacheServerMaxAge: z.coerce.number().nonnegative('Cache server max-age must be non-negative'),
        cacheMaxAge: z.coerce.number().nonnegative('Cache max-age must be non-negative'),
        cacheStaleWhileRevalidate: z.coerce.number().nonnegative('Cache stale-while-revalidate must be non-negative'),
        plans: z.string().transform(parsePlans),
        x402Enabled: z.coerce.string().transform((val) => val.toLowerCase() === 'true'),
        x402FacilitatorUrl: z.string().url({ message: 'Invalid x402 facilitator URL' }),
        x402EvmNetwork: z.string().min(1, 'x402 EVM network cannot be empty'),
        x402SvmNetwork: z.string().min(1, 'x402 SVM network cannot be empty'),
        x402EvmPayTo: z.string().min(1, 'x402 EVM pay-to address cannot be empty'),
        x402SvmPayTo: z.string().min(1, 'x402 SVM pay-to address cannot be empty'),
        x402PassPrice: z.string().regex(/^\$\d+(\.\d+)?$/, 'x402 pass price must be a USD amount like $0.10'),
        x402PassDurationSeconds: z.coerce.number().positive('x402 pass duration must be positive'),
        x402Plan: z.string().min(1, 'x402 plan cannot be empty'),
        x402SyncFacilitatorOnStart: z.coerce.string().transform((val) => val.toLowerCase() === 'true'),
    })
    .transform((data) => {
        // Use YAML config as the authoritative source — spread all database maps dynamically
        const { clusters, ...databaseMaps } = loadDbsConfig(data.dbsConfigPath);
        return {
            ...data,
            clusters,
            ...databaseMaps,
        };
    })
    .transform((data) => ({
        ...data,
        evmNetworks: Object.keys({
            ...data.balancesDatabases,
            ...data.transfersDatabases,
            ...data.nftsDatabases,
            ...data.dexesDatabases,
            ...data.contractsDatabases,
        })
            .filter((networkId) => {
                return (
                    {
                        ...data.balancesDatabases,
                        ...data.transfersDatabases,
                        ...data.nftsDatabases,
                        ...data.dexesDatabases,
                        ...data.contractsDatabases,
                    }[networkId]?.type === 'evm'
                );
            })
            .sort(),
        svmNetworks: Object.keys({
            ...data.balancesDatabases,
            ...data.transfersDatabases,
            ...data.nftsDatabases,
            ...data.dexesDatabases,
            ...data.contractsDatabases,
        })
            .filter((networkId) => {
                return (
                    {
                        ...data.balancesDatabases,
                        ...data.transfersDatabases,
                        ...data.nftsDatabases,
                        ...data.dexesDatabases,
                        ...data.contractsDatabases,
                    }[networkId]?.type === 'svm'
                );
            })
            .sort(),
        tvmNetworks: Object.keys({
            ...data.transfersDatabases,
            ...data.dexesDatabases,
        })
            .filter((networkId) => {
                return (
                    {
                        ...data.transfersDatabases,
                        ...data.dexesDatabases,
                    }[networkId]?.type === 'tvm'
                );
            })
            .sort(),
    }))
    .transform((data) => ({
        ...data,
        networks: [...data.evmNetworks, ...data.svmNetworks, ...data.tvmNetworks],
    }))
    .parse(opts);

export { config };
