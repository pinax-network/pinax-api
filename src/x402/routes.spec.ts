import { describe, expect, it } from 'bun:test';
import { config } from '../config.js';
import { createX402RouteConfig, X402_FREE_GET_ROUTES, X402_PROTECTED_GET_ROUTES } from './routes.js';

describe('x402 route config', () => {
    it('prices every protected route as a one-hour access pass on EVM and SVM', () => {
        const routeConfig = createX402RouteConfig(config) as Record<string, { accepts: { network: string }[] }>;

        expect(Object.keys(routeConfig)).toHaveLength(X402_PROTECTED_GET_ROUTES.length);
        expect(routeConfig['GET /v1/evm/tokens']?.accepts).toEqual([
            expect.objectContaining({
                scheme: 'exact',
                price: '$0.10',
                network: 'eip155:8453',
                payTo: '0x49D581486438aAD93f4114084Ac5B09A8b7C9685',
            }),
            expect.objectContaining({
                scheme: 'exact',
                price: '$0.10',
                network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
                payTo: 'EpRR35QnB5PfTczy3j5rp9bCw4NKzHkd8S1ubdza4my9',
            }),
        ]);
        expect(routeConfig['GET /v1/svm/dexes']).toBeUndefined();
        expect(routeConfig['GET /v1/polymarket/markets']).toBeUndefined();
    });

    it('tracks concrete free routes separately from protected routes', () => {
        for (const route of X402_FREE_GET_ROUTES) {
            expect(X402_PROTECTED_GET_ROUTES).not.toContain(route as (typeof X402_PROTECTED_GET_ROUTES)[number]);
        }
    });
});
