import type { Context } from 'hono';
import type { DescribeRouteOptions } from 'hono-openapi';
import { resolver } from 'hono-openapi';
import { ZodError } from 'zod';
import { logger } from './logger.js';
import {
    type ApiErrorResponse,
    type ClientErrorResponse,
    clientErrorResponseSchema,
    evmIntervalSchema,
    type ServerErrorResponse,
    serverErrorResponseSchema,
} from './types/zod.js';

// Plan limits are injected by the upstream gateway on every authenticated
// request. Requests without these headers (e.g. local development) bypass
// enforcement.
const HEADER_BATCH_SIZE = 'x-token-api-batch-size';
const HEADER_ITEMS_RETURNED = 'x-token-api-items-returned';
const HEADER_LOWEST_TIME_PARAMETER = 'x-token-api-lowest-time-parameter';

function parseLimitHeader(raw: string | undefined): number | null {
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

export function APIErrorResponse(
    c: Context,
    status: ApiErrorResponse['status'],
    code: ApiErrorResponse['code'],
    err: unknown
) {
    let message = 'An unexpected error occured';

    if (typeof err === 'string') {
        message = err;
    } else if (err instanceof ZodError) {
        message = err.issues.map((issue) => `[${issue.code}] ${issue.path.join('/')}: ${issue.message}`).join(' | ');
    } else if (Array.isArray(err)) {
        // Handle Hono's reformatted validation errors
        message = err.map((issue) => `[${issue.code}] ${issue.path.join('/')}: ${issue.message}`).join(' | ');
    } else if (err instanceof Error) {
        message = err.message;
    }

    let api_error = {
        status,
        code,
        message,
    };

    logger.error(api_error);

    // Handle query execution timeout
    if (message.includes('Timeout')) {
        api_error = {
            status: 504 as ServerErrorResponse['status'],
            code: 'database_timeout' as ServerErrorResponse['code'],
            message: 'Query took too long. Consider applying more filter parameters if possible.',
        };
    }

    if (api_error.status >= 500)
        return c.json<ServerErrorResponse, typeof status>(api_error as ServerErrorResponse, api_error.status);

    return c.json<ClientErrorResponse, typeof status>(api_error as ClientErrorResponse, api_error.status);
}

export function now() {
    return Math.floor(Date.now() / 1000);
}

export function validatorHook(
    parseResult:
        | {
              success: true;
              data: {
                  limit?: number;
                  start_time?: number;
                  end_time?: number;
                  interval?: number;
              } & {
                  [key: string]: unknown | unknown[];
              };
          }
        | { success: false; error: unknown },
    ctx: Context
) {
    if (!parseResult.success) return APIErrorResponse(ctx, 400, 'bad_query_input', parseResult.error);

    const maxItems = parseLimitHeader(ctx.req.header(HEADER_ITEMS_RETURNED));
    const maxBatch = parseLimitHeader(ctx.req.header(HEADER_BATCH_SIZE));
    const lowestInterval = ctx.req.header(HEADER_LOWEST_TIME_PARAMETER);
    const data = parseResult.data;

    // `items-returned`: cap on `limit`. 0 = unlimited.
    if (maxItems !== null && maxItems > 0 && data.limit && data.limit > maxItems) {
        return APIErrorResponse(ctx, 403, 'forbidden', `Parameter 'limit' exceeds maximum of ${maxItems} items.`);
    }

    // `batch-size`: cap on any array-valued query parameter. 0 = unlimited.
    if (maxBatch !== null && maxBatch > 0) {
        const exceededParams = Object.entries(data)
            .filter(([_, value]) => Array.isArray(value) && value.length > maxBatch)
            .map(([key, value]) => ({ name: key, length: (value as unknown[]).length }));

        if (exceededParams.length > 0) {
            const paramDetails = exceededParams.map((p) => `'${p.name}' (${p.length} values)`).join(', ');
            return APIErrorResponse(
                ctx,
                403,
                'forbidden',
                `Parameters ${paramDetails} exceed maximum batch limit of ${maxBatch}.`
            );
        }
    }

    // `lowest-time-parameter`: minimum granularity (in minutes) the user may query.
    // Only OHLCV endpoints carry an `interval` field.
    if (lowestInterval && data.interval) {
        const parsed = evmIntervalSchema.safeParse(lowestInterval);
        if (parsed.success && data.interval < parsed.data) {
            return APIErrorResponse(
                ctx,
                403,
                'forbidden',
                `Parameter 'interval' must be coarser than or equal to '${lowestInterval}'.`
            );
        }
    }

    if (parseResult.data)
        ctx.set('validatedData', {
            ...(ctx.get('validatedData') || {}),
            ...parseResult.data,
        });
}

// Wrapper function to add error responses to existing route descriptions
export function withErrorResponses(routeDescription: DescribeRouteOptions): DescribeRouteOptions {
    return {
        ...routeDescription,
        responses: {
            ...(routeDescription.responses || {}),
            400: {
                description: 'Client side error',
                content: {
                    'application/json': {
                        schema: resolver(clientErrorResponseSchema),
                        examples: {
                            example: {
                                value: {
                                    status: 400,
                                    code: 'bad_query_input',
                                    message: 'Invalid query parameter provided',
                                },
                            },
                        },
                    },
                },
            },
            401: {
                description: 'Authentication failed',
                content: {
                    'application/json': {
                        schema: resolver(clientErrorResponseSchema),
                        examples: {
                            example: {
                                value: {
                                    status: 401,
                                    code: 'unauthorized',
                                    message: 'Authentication required',
                                },
                            },
                        },
                    },
                },
            },
            403: {
                description: 'Forbidden',
                content: {
                    'application/json': {
                        schema: resolver(clientErrorResponseSchema),
                        examples: {
                            example: {
                                value: {
                                    status: 403,
                                    code: 'forbidden',
                                    message: 'Access denied',
                                },
                            },
                        },
                    },
                },
            },
            404: {
                description: 'Not found',
                content: {
                    'application/json': {
                        schema: resolver(clientErrorResponseSchema),
                        examples: {
                            example: {
                                value: {
                                    status: 404,
                                    code: 'not_found_data',
                                    message: 'Resource not found',
                                },
                            },
                        },
                    },
                },
            },
            500: {
                description: 'Server side error',
                content: {
                    'application/json': {
                        schema: resolver(serverErrorResponseSchema),
                        examples: {
                            example: {
                                value: {
                                    status: 500,
                                    code: 'internal_server_error',
                                    message: 'An unexpected error occurred',
                                },
                            },
                        },
                    },
                },
            },
        },
    };
}

/**
 * Executes a promise with a timeout. If the promise does not resolve within the specified timeout,
 * it will reject with a timeout error.
 * @param promise The promise to execute with timeout
 * @param timeoutMs Timeout in milliseconds
 * @param errorMsg Optional custom error message for timeout
 * @returns Promise that resolves with the original promise result or rejects on timeout
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMsg = 'Operation timed out'): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
            setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
        }),
    ]);
}
