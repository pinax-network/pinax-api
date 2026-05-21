import { describe, expect, it, mock } from 'bun:test';
import type { Context } from 'hono';
import { EVM_CONTRACT_NATIVE_EXAMPLE } from '../types/examples.js';
import { nativeContractRedirect, nativeMintRedirect } from './nativeContractRedirect.js';

// Helper function to create a mock Hono context
function createMockContext(url: string): Context {
    return {
        req: {
            url,
        },
        redirect: mock((redirectUrl: string) => ({ redirectUrl })),
    } as unknown as Context;
}

// Helper function to create a mock next function
function createMockNext() {
    return mock(async () => {});
}

describe('nativeContractRedirect middleware', () => {
    describe('when contract parameter is native address (single value)', () => {
        it('should redirect to /native endpoint and remove contract param', async () => {
            const url = `https://api.example.com/v1/evm/transfers?network=mainnet&contract=${EVM_CONTRACT_NATIVE_EXAMPLE}`;
            const ctx = createMockContext(url);
            const next = createMockNext();

            await nativeContractRedirect(ctx, next);

            expect(ctx.redirect).toHaveBeenCalledTimes(1);
            const redirectedUrl = (ctx.redirect as any).mock.calls[0][0];
            expect(redirectedUrl).toContain('/v1/evm/transfers/native');
            expect(redirectedUrl).toContain('network=mainnet');
            expect(redirectedUrl).not.toContain('contract=');
            expect(next).not.toHaveBeenCalled();
        });

        it('should handle uppercase native address', async () => {
            const upperCaseNative = EVM_CONTRACT_NATIVE_EXAMPLE.toUpperCase();
            const url = `https://api.example.com/v1/evm/balances?network=mainnet&contract=${upperCaseNative}`;
            const ctx = createMockContext(url);
            const next = createMockNext();

            await nativeContractRedirect(ctx, next);

            expect(ctx.redirect).toHaveBeenCalledTimes(1);
            const redirectedUrl = (ctx.redirect as any).mock.calls[0][0];
            expect(redirectedUrl).toContain('/v1/evm/balances/native');
            expect(redirectedUrl).not.toContain('contract=');
            expect(next).not.toHaveBeenCalled();
        });

        it('should handle mixed case native address', async () => {
            // Create mixed-case version by capitalizing every other 'e'
            const mixedCaseNative = EVM_CONTRACT_NATIVE_EXAMPLE.split('')
                .map((char, idx) => (char === 'e' && idx % 2 === 0 ? 'E' : char))
                .join('');
            const url = `https://api.example.com/v1/evm/transfers?network=mainnet&contract=${mixedCaseNative}`;
            const ctx = createMockContext(url);
            const next = createMockNext();

            await nativeContractRedirect(ctx, next);

            expect(ctx.redirect).toHaveBeenCalledTimes(1);
            const redirectedUrl = (ctx.redirect as any).mock.calls[0][0];
            expect(redirectedUrl).toContain('/v1/evm/transfers/native');
            expect(next).not.toHaveBeenCalled();
        });

        it('should preserve other query parameters', async () => {
            const url = `https://api.example.com/v1/evm/transfers?network=mainnet&contract=${EVM_CONTRACT_NATIVE_EXAMPLE}&from_address=0x123&limit=50`;
            const ctx = createMockContext(url);
            const next = createMockNext();

            await nativeContractRedirect(ctx, next);

            expect(ctx.redirect).toHaveBeenCalledTimes(1);
            const redirectedUrl = (ctx.redirect as any).mock.calls[0][0];
            expect(redirectedUrl).toContain('/v1/evm/transfers/native');
            expect(redirectedUrl).toContain('network=mainnet');
            expect(redirectedUrl).toContain('from_address=0x123');
            expect(redirectedUrl).toContain('limit=50');
            expect(redirectedUrl).not.toContain('contract=');
        });
    });

    describe('when contract parameter is NOT native address', () => {
        it('should continue normal processing for different contract address', async () => {
            const url =
                'https://api.example.com/v1/evm/transfers?network=mainnet&contract=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
            const ctx = createMockContext(url);
            const next = createMockNext();

            await nativeContractRedirect(ctx, next);

            expect(ctx.redirect).not.toHaveBeenCalled();
            expect(next).toHaveBeenCalledTimes(1);
        });

        it('should continue normal processing when contract is comma-separated (multiple values)', async () => {
            const url = `https://api.example.com/v1/evm/transfers?network=mainnet&contract=${EVM_CONTRACT_NATIVE_EXAMPLE},0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`;
            const ctx = createMockContext(url);
            const next = createMockNext();

            await nativeContractRedirect(ctx, next);

            expect(ctx.redirect).not.toHaveBeenCalled();
            expect(next).toHaveBeenCalledTimes(1);
        });

        it('should continue normal processing when no contract parameter', async () => {
            const url = 'https://api.example.com/v1/evm/transfers?network=mainnet';
            const ctx = createMockContext(url);
            const next = createMockNext();

            await nativeContractRedirect(ctx, next);

            expect(ctx.redirect).not.toHaveBeenCalled();
            expect(next).toHaveBeenCalledTimes(1);
        });

        it('should continue normal processing when contract parameter is empty', async () => {
            const url = 'https://api.example.com/v1/evm/transfers?network=mainnet&contract=';
            const ctx = createMockContext(url);
            const next = createMockNext();

            await nativeContractRedirect(ctx, next);

            expect(ctx.redirect).not.toHaveBeenCalled();
            expect(next).toHaveBeenCalledTimes(1);
        });

        it('should continue normal processing when contract is repeated (batched as array)', async () => {
            const url = `https://api.example.com/v1/evm/transfers?network=mainnet&contract=${EVM_CONTRACT_NATIVE_EXAMPLE}&contract=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`;
            const ctx = createMockContext(url);
            const next = createMockNext();

            await nativeContractRedirect(ctx, next);

            expect(ctx.redirect).not.toHaveBeenCalled();
            expect(next).toHaveBeenCalledTimes(1);
        });
    });

    describe('redirect URL format', () => {
        it('should use relative path (no scheme/host) for redirect behind reverse proxy', async () => {
            const url = `http://pinax-api-http-svc:80/v1/evm/transfers?network=mainnet&contract=${EVM_CONTRACT_NATIVE_EXAMPLE}`;
            const ctx = createMockContext(url);
            const next = createMockNext();

            await nativeContractRedirect(ctx, next);

            const redirectedUrl = (ctx.redirect as any).mock.calls[0][0];
            expect(redirectedUrl).not.toContain('http://');
            expect(redirectedUrl).not.toContain('https://');
            expect(redirectedUrl).toBe('/v1/evm/transfers/native?network=mainnet');
        });
    });
});

describe('nativeMintRedirect middleware', () => {
    const nativeAliases = [
        '11111111111111111111111111111111',
        'So11111111111111111111111111111111111111111',
        'so11111111111111111111111111111111111111111',
        'SO11111111111111111111111111111111111111111',
        'sol11111111111111111111111111111111',
        'SOL11111111111111111111111111111111',
    ];

    for (const alias of nativeAliases) {
        it(`should redirect native mint alias ${alias} to /native endpoint`, async () => {
            const url = `https://api.example.com/v1/svm/transfers?network=solana&mint=${alias}&limit=1`;
            const ctx = createMockContext(url);
            const next = createMockNext();

            await nativeMintRedirect(ctx, next);

            expect(ctx.redirect).toHaveBeenCalledTimes(1);
            const redirectedUrl = (ctx.redirect as any).mock.calls[0][0];
            expect(redirectedUrl).toBe('/v1/svm/transfers/native?network=solana&limit=1');
            expect(next).not.toHaveBeenCalled();
        });
    }

    it('should use relative path behind reverse proxy', async () => {
        const url = 'http://localhost:8000/v1/svm/holders?network=solana&mint=11111111111111111111111111111111&limit=5';
        const ctx = createMockContext(url);
        const next = createMockNext();

        await nativeMintRedirect(ctx, next);

        const redirectedUrl = (ctx.redirect as any).mock.calls[0][0];
        expect(redirectedUrl).not.toContain('http://');
        expect(redirectedUrl).toBe('/v1/svm/holders/native?network=solana&limit=5');
    });

    it('should not redirect for wSOL mint (real SPL token, ends in 2)', async () => {
        const url =
            'https://api.example.com/v1/svm/transfers?network=solana&mint=So11111111111111111111111111111111111111112&limit=1';
        const ctx = createMockContext(url);
        const next = createMockNext();

        await nativeMintRedirect(ctx, next);

        expect(ctx.redirect).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('should not redirect when mint is comma-separated (multiple values)', async () => {
        const url =
            'https://api.example.com/v1/svm/transfers?network=solana&mint=So11111111111111111111111111111111111111111,So11111111111111111111111111111111111111112';
        const ctx = createMockContext(url);
        const next = createMockNext();

        await nativeMintRedirect(ctx, next);

        expect(ctx.redirect).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('should not redirect when mint is repeated (batched as array)', async () => {
        const url =
            'https://api.example.com/v1/svm/transfers?network=solana&mint=So11111111111111111111111111111111111111111&mint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        const ctx = createMockContext(url);
        const next = createMockNext();

        await nativeMintRedirect(ctx, next);

        expect(ctx.redirect).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('should not redirect when no mint parameter', async () => {
        const url = 'https://api.example.com/v1/svm/transfers?network=solana&limit=1';
        const ctx = createMockContext(url);
        const next = createMockNext();

        await nativeMintRedirect(ctx, next);

        expect(ctx.redirect).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
    });
});
