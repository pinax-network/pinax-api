import { describe, expect, it, mock } from 'bun:test';
import type { Context } from 'hono';
import { z } from 'zod';
import { APIErrorResponse, now, validatorHook, withErrorResponses, withTimeout } from './utils.js';

function createMockContext(
    overrides: Partial<{
        path: string;
        headers: Record<string, string>;
        validatedData: Record<string, unknown>;
    }> = {}
): Context {
    const store = new Map<string, unknown>();
    if (overrides.validatedData) {
        store.set('validatedData', overrides.validatedData);
    }

    return {
        json: mock((data: unknown, status: number) => ({ data, status })),
        set: mock((key: string, value: unknown) => store.set(key, value)),
        get: mock((key: string) => store.get(key)),
        req: {
            path: overrides.path || '/api/v1/tokens',
            header: mock((name: string) => overrides.headers?.[name] || undefined),
        },
    } as unknown as Context;
}

describe('APIErrorResponse', () => {
    it('should handle string error messages', () => {
        const ctx = createMockContext();
        APIErrorResponse(ctx, 400, 'bad_query_input', 'Invalid parameter');

        expect(ctx.json).toHaveBeenCalledWith(
            {
                status: 400,
                code: 'bad_query_input',
                message: 'Invalid parameter',
            },
            400
        );
    });

    it('should handle Error instances', () => {
        const ctx = createMockContext();
        const error = new Error('Something went wrong');
        APIErrorResponse(ctx, 500, 'internal_server_error', error);

        expect(ctx.json).toHaveBeenCalledWith(
            {
                status: 500,
                code: 'internal_server_error',
                message: 'Something went wrong',
            },
            500
        );
    });

    it('should format ZodError with multiple issues', () => {
        const ctx = createMockContext();
        const schema = z.object({
            name: z.string(),
            age: z.number(),
        });

        try {
            schema.parse({ name: 123, age: 'invalid' });
        } catch (error) {
            APIErrorResponse(ctx, 400, 'bad_query_input', error);

            const mockJson = ctx.json as ReturnType<typeof mock>;
            const callArgs = mockJson.mock.calls[0] as [unknown, number];
            expect(callArgs[0]).toHaveProperty('message');
            expect((callArgs[0] as { message: string }).message).toContain('name');
            expect((callArgs[0] as { message: string }).message).toContain('age');
        }
    });

    it('should handle timeout errors specially', () => {
        const ctx = createMockContext();
        APIErrorResponse(ctx, 500, 'internal_server_error', 'Query execution timeout: Timeout exceeded');

        expect(ctx.json).toHaveBeenCalledWith(
            {
                status: 504,
                code: 'database_timeout',
                message: 'Query took too long. Consider applying more filter parameters if possible.',
            },
            504
        );
    });

    it('should return client error response for 4xx status codes', () => {
        const ctx = createMockContext();
        APIErrorResponse(ctx, 404, 'not_found_data', 'Resource not found');

        const mockJson = ctx.json as ReturnType<typeof mock>;
        const callArgs = mockJson.mock.calls[0] as [unknown, number];
        expect(callArgs[1]).toBe(404);
    });

    it('should return server error response for 5xx status codes', () => {
        const ctx = createMockContext();
        APIErrorResponse(ctx, 502, 'connection_refused', 'Database connection refused');

        const mockJson = ctx.json as ReturnType<typeof mock>;
        const callArgs = mockJson.mock.calls[0] as [unknown, number];
        expect(callArgs[1]).toBe(502);
    });

    it('should use default message for unknown error types', () => {
        const ctx = createMockContext();
        APIErrorResponse(ctx, 500, 'internal_server_error', { unknown: 'error' });

        const mockJson = ctx.json as ReturnType<typeof mock>;
        const callArgs = mockJson.mock.calls[0] as [{ message: string }, number];
        expect(callArgs[0].message).toBe('An unexpected error occured');
    });
});

describe('now', () => {
    it('should return current UNIX timestamp in seconds', () => {
        const result = now();
        const expected = Math.floor(Date.now() / 1000);

        expect(Math.abs(result - expected)).toBeLessThanOrEqual(1);
    });

    it('should return an integer', () => {
        const result = now();
        expect(Number.isInteger(result)).toBe(true);
    });

    it('should return a positive number', () => {
        const result = now();
        expect(result).toBeGreaterThan(0);
    });
});

describe('validatorHook', () => {
    it('should set validated data on successful parse', () => {
        const ctx = createMockContext();
        const parseResult = {
            success: true as const,
            data: { limit: 10, name: 'John', age: 30 },
        };

        validatorHook(parseResult, ctx);

        expect(ctx.set).toHaveBeenCalledWith('validatedData', { limit: 10, name: 'John', age: 30 });
    });

    it('should merge with existing validated data', () => {
        const ctx = createMockContext();
        ctx.set('validatedData', { existing: 'data' });

        const parseResult = {
            success: true as const,
            data: { limit: 10, name: 'John' },
        };

        validatorHook(parseResult, ctx);

        expect(ctx.set).toHaveBeenCalledWith('validatedData', {
            existing: 'data',
            limit: 10,
            name: 'John',
        });
    });

    it('should return error response on parse failure', () => {
        const ctx = createMockContext();
        const parseResult = {
            success: false as const,
            error: new Error('Validation failed'),
        };

        validatorHook(parseResult, ctx);

        expect(ctx.json).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 400,
                code: 'bad_query_input',
            }),
            400
        );
    });

    it('should handle ZodError in parse failure', () => {
        const ctx = createMockContext();
        const schema = z.object({ name: z.string() });

        try {
            schema.parse({ name: 123 });
        } catch (error) {
            const parseResult = {
                success: false as const,
                error,
            };

            validatorHook(parseResult, ctx);

            const mockJson = ctx.json as ReturnType<typeof mock>;
            const callArgs = mockJson.mock.calls[0] as [{ message: string }, number];
            expect(callArgs[0].message).toContain('name');
        }
    });

    it('should not set validated data on failure', () => {
        const ctx = createMockContext();
        const parseResult = {
            success: false as const,
            error: new Error('Failed'),
        };

        validatorHook(parseResult, ctx);

        const mockSet = ctx.set as ReturnType<typeof mock>;
        const validatedDataCalls = mockSet.mock.calls.filter((call: unknown[]) => call[0] === 'validatedData');
        expect(validatedDataCalls).toHaveLength(0);
    });

    describe('Plan Limits (gateway headers)', () => {
        describe('No headers (local dev / direct hit)', () => {
            it('should bypass all checks when no limit headers are set', () => {
                const ctx = createMockContext();
                const parseResult = {
                    success: true as const,
                    data: {
                        limit: 10_000,
                        addresses: new Array(1000).fill('0x123'),
                        interval: 1,
                    },
                };

                const result = validatorHook(parseResult, ctx);
                expect(result).toBeUndefined();
                expect(ctx.set).toHaveBeenCalledWith('validatedData', expect.any(Object));
            });
        });

        describe('x-pinax-api-items-returned', () => {
            it('should allow limit within bounds', () => {
                const ctx = createMockContext({ headers: { 'x-pinax-api-items-returned': '15' } });
                const parseResult = { success: true as const, data: { limit: 15 } };
                expect(validatorHook(parseResult, ctx)).toBeUndefined();
            });

            it('should reject limit exceeding header cap', () => {
                const ctx = createMockContext({ headers: { 'x-pinax-api-items-returned': '15' } });
                const parseResult = { success: true as const, data: { limit: 16 } };
                expect(validatorHook(parseResult, ctx)).toBeDefined();
            });

            it('should treat 0 as unlimited', () => {
                const ctx = createMockContext({ headers: { 'x-pinax-api-items-returned': '0' } });
                const parseResult = { success: true as const, data: { limit: 100_000 } };
                expect(validatorHook(parseResult, ctx)).toBeUndefined();
            });

            it('should accept the legacy x-token-api-items-returned header', () => {
                const ctx = createMockContext({ headers: { 'x-token-api-items-returned': '15' } });
                const parseResult = { success: true as const, data: { limit: 16 } };
                expect(validatorHook(parseResult, ctx)).toBeDefined();
            });
        });

        describe('x-pinax-api-batch-size', () => {
            it('should allow batched parameters within bounds', () => {
                const ctx = createMockContext({ headers: { 'x-pinax-api-batch-size': '3' } });
                const parseResult = {
                    success: true as const,
                    data: { limit: 10, addresses: ['0x1', '0x2', '0x3'] },
                };
                expect(validatorHook(parseResult, ctx)).toBeUndefined();
            });

            it('should reject batched parameters exceeding header cap', () => {
                const ctx = createMockContext({ headers: { 'x-pinax-api-batch-size': '3' } });
                const parseResult = {
                    success: true as const,
                    data: { limit: 10, addresses: ['0x1', '0x2', '0x3', '0x4'] },
                };
                expect(validatorHook(parseResult, ctx)).toBeDefined();
            });

            it('should report all exceeded batched parameters', () => {
                const ctx = createMockContext({ headers: { 'x-pinax-api-batch-size': '3' } });
                const parseResult = {
                    success: true as const,
                    data: {
                        limit: 10,
                        addresses: ['0x1', '0x2', '0x3', '0x4'],
                        chain_ids: ['1', '56', '137', '10'],
                    },
                };
                expect(validatorHook(parseResult, ctx)).toBeDefined();
            });

            it('should treat 0 as unlimited', () => {
                const ctx = createMockContext({ headers: { 'x-pinax-api-batch-size': '0' } });
                const parseResult = {
                    success: true as const,
                    data: { addresses: new Array(500).fill('0x1') },
                };
                expect(validatorHook(parseResult, ctx)).toBeUndefined();
            });

            it('should accept the legacy x-token-api-batch-size header', () => {
                const ctx = createMockContext({ headers: { 'x-token-api-batch-size': '3' } });
                const parseResult = {
                    success: true as const,
                    data: { limit: 10, addresses: ['0x1', '0x2', '0x3', '0x4'] },
                };
                expect(validatorHook(parseResult, ctx)).toBeDefined();
            });
        });

        describe('x-pinax-api-lowest-time-parameter', () => {
            it('should allow interval equal to threshold', () => {
                const ctx = createMockContext({ headers: { 'x-pinax-api-lowest-time-parameter': '4h' } });
                const parseResult = { success: true as const, data: { interval: 240 } };
                expect(validatorHook(parseResult, ctx)).toBeUndefined();
            });

            it('should allow coarser interval than threshold', () => {
                const ctx = createMockContext({ headers: { 'x-pinax-api-lowest-time-parameter': '4h' } });
                const parseResult = { success: true as const, data: { interval: 1440 } };
                expect(validatorHook(parseResult, ctx)).toBeUndefined();
            });

            it('should reject finer interval than threshold', () => {
                const ctx = createMockContext({ headers: { 'x-pinax-api-lowest-time-parameter': '4h' } });
                const parseResult = { success: true as const, data: { interval: 60 } };
                expect(validatorHook(parseResult, ctx)).toBeDefined();
            });

            it('should ignore invalid header values', () => {
                const ctx = createMockContext({ headers: { 'x-pinax-api-lowest-time-parameter': 'bogus' } });
                const parseResult = { success: true as const, data: { interval: 1 } };
                expect(validatorHook(parseResult, ctx)).toBeUndefined();
            });

            it('should not check threshold when interval is absent', () => {
                const ctx = createMockContext({ headers: { 'x-pinax-api-lowest-time-parameter': '1d' } });
                const parseResult = { success: true as const, data: { limit: 10 } };
                expect(validatorHook(parseResult, ctx)).toBeUndefined();
            });

            it('should accept the legacy x-token-api-lowest-time-parameter header', () => {
                const ctx = createMockContext({ headers: { 'x-token-api-lowest-time-parameter': '4h' } });
                const parseResult = { success: true as const, data: { interval: 60 } };
                expect(validatorHook(parseResult, ctx)).toBeDefined();
            });
        });

        describe('Combined headers', () => {
            it('should enforce all three limits together', () => {
                const ctx = createMockContext({
                    headers: {
                        'x-pinax-api-items-returned': '100',
                        'x-pinax-api-batch-size': '10',
                        'x-pinax-api-lowest-time-parameter': '1h',
                    },
                });
                const parseResult = {
                    success: true as const,
                    data: {
                        limit: 50,
                        addresses: new Array(5).fill('0x1'),
                        interval: 240,
                    },
                };
                expect(validatorHook(parseResult, ctx)).toBeUndefined();
            });

            it('should merge validatedData with existing context data', () => {
                const ctx = createMockContext({
                    headers: { 'x-pinax-api-items-returned': '50' },
                    validatedData: { existing: 'data' },
                });
                const parseResult = {
                    success: true as const,
                    data: { limit: 20, address: '0x123' },
                };

                validatorHook(parseResult, ctx);
                expect(ctx.set).toHaveBeenCalledWith('validatedData', {
                    existing: 'data',
                    limit: 20,
                    address: '0x123',
                });
            });
        });
    });
});

describe('withErrorResponses', () => {
    it('should add error responses to route description', () => {
        const routeDescription = {
            summary: 'Get user',
            responses: {
                200: { description: 'Success' },
            },
        };

        const result = withErrorResponses(routeDescription);

        expect((result.responses as Record<string, unknown>)[200]).toEqual({ description: 'Success' });
        expect((result.responses as Record<string, unknown>)[400]).toBeDefined();
        expect((result.responses as Record<string, unknown>)[401]).toBeDefined();
        expect((result.responses as Record<string, unknown>)[403]).toBeDefined();
        expect((result.responses as Record<string, unknown>)[404]).toBeDefined();
        expect((result.responses as Record<string, unknown>)[500]).toBeDefined();
    });

    it('should preserve existing route properties', () => {
        const routeDescription = {
            summary: 'Get user',
            tags: ['users'],
            responses: {},
        };

        const result = withErrorResponses(routeDescription);

        expect((result as unknown as Record<string, unknown>).summary).toBe('Get user');
        expect((result as unknown as Record<string, unknown>).tags).toEqual(['users']);
    });

    it('should not overwrite existing error responses', () => {
        const routeDescription = {
            responses: {
                400: { description: 'Custom bad request' },
            },
        };

        const result = withErrorResponses(routeDescription);

        expect(result.responses?.['400']).toBeDefined();
        expect((result.responses?.['400'] as any)?.description).toBeDefined();
    });

    it('should include proper error response schemas', () => {
        const routeDescription = { responses: {} };
        const result = withErrorResponses(routeDescription);

        expect((result.responses?.['400'] as any)?.content?.['application/json']?.schema).toBeDefined();
        expect((result.responses?.['500'] as any)?.content?.['application/json']?.schema).toBeDefined();
    });

    it('should include example error responses', () => {
        const routeDescription = { responses: {} };
        const result = withErrorResponses(routeDescription);

        expect((result.responses?.['400'] as any)?.content?.['application/json']?.examples?.example?.value).toEqual({
            status: 400,
            code: 'bad_query_input',
            message: 'Invalid query parameter provided',
        });

        expect((result.responses?.['500'] as any)?.content?.['application/json']?.examples?.example?.value).toEqual({
            status: 500,
            code: 'internal_server_error',
            message: 'An unexpected error occurred',
        });
    });

    it('should handle route description without responses', () => {
        const routeDescription = {
            summary: 'Get user',
        };

        const result = withErrorResponses(routeDescription);

        expect(result.responses?.['400']).toBeDefined();
        expect(result.responses?.['500']).toBeDefined();
    });
});

describe('withTimeout', () => {
    it('should resolve when promise completes before timeout', async () => {
        const promise = new Promise((resolve) => {
            setTimeout(() => resolve('success'), 50);
        });

        const result = await withTimeout(promise, 200);
        expect(result).toBe('success');
    });

    it('should reject when promise exceeds timeout', async () => {
        const promise = new Promise((resolve) => {
            setTimeout(() => resolve('too late'), 200);
        });

        try {
            await withTimeout(promise, 50);
            expect(true).toBe(false);
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBe('Operation timed out');
        }
    });

    it('should use custom error message', async () => {
        const promise = new Promise((resolve) => {
            setTimeout(() => resolve('done'), 200);
        });

        try {
            await withTimeout(promise, 50, 'Custom timeout message');
            expect(true).toBe(false);
        } catch (error) {
            expect((error as Error).message).toBe('Custom timeout message');
        }
    });

    it('should preserve promise rejection', async () => {
        const promise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Promise failed')), 50);
        });

        try {
            await withTimeout(promise, 200);
            expect(true).toBe(false);
        } catch (error) {
            expect((error as Error).message).toBe('Promise failed');
        }
    });

    it('should handle immediate promise resolution', async () => {
        const promise = Promise.resolve('immediate');
        const result = await withTimeout(promise, 100);
        expect(result).toBe('immediate');
    });

    it('should handle immediate promise rejection', async () => {
        const promise = Promise.reject(new Error('immediate failure'));

        try {
            await withTimeout(promise, 100);
            expect(true).toBe(false);
        } catch (error) {
            expect((error as Error).message).toBe('immediate failure');
        }
    });

    it('should handle very short timeouts', async () => {
        const promise = new Promise((resolve) => {
            setTimeout(() => resolve('done'), 100);
        });

        try {
            await withTimeout(promise, 1);
            expect(true).toBe(false);
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should work with different return types', async () => {
        const numberPromise = Promise.resolve(42);
        const objectPromise = Promise.resolve({ key: 'value' });
        const arrayPromise = Promise.resolve([1, 2, 3]);

        expect(await withTimeout(numberPromise, 100)).toBe(42);
        expect(await withTimeout(objectPromise, 100)).toEqual({ key: 'value' });
        expect(await withTimeout(arrayPromise, 100)).toEqual([1, 2, 3]);
    });
});
