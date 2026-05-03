import type { RouteConfig, RoutesConfig } from '@x402/core/server';
import type { Network } from '@x402/core/types';
import { declareDiscoveryExtension } from '@x402/extensions/bazaar';
import { declarePaymentIdentifierExtension, PAYMENT_IDENTIFIER } from '@x402/extensions/payment-identifier';
import type { config } from '../config.js';

export const X402_ACCESS_PASS_RESOURCE_PATH = '/v1/x402/access-pass/pro-1h';

export const X402_PROTECTED_GET_ROUTES = [
    '/v1/svm/transfers',
    '/v1/svm/balances',
    '/v1/svm/holders',
    '/v1/svm/owner',
    '/v1/svm/tokens',
    '/v1/svm/transfers/native',
    '/v1/svm/balances/native',
    '/v1/svm/holders/native',
    '/v1/svm/tokens/native',
    '/v1/svm/swaps',
    '/v1/svm/pools',
    '/v1/svm/pools/ohlc',
    '/v1/evm/transfers',
    '/v1/evm/balances',
    '/v1/evm/holders',
    '/v1/evm/tokens',
    '/v1/evm/balances/historical',
    '/v1/evm/transfers/native',
    '/v1/evm/balances/native',
    '/v1/evm/holders/native',
    '/v1/evm/tokens/native',
    '/v1/evm/balances/historical/native',
    '/v1/evm/swaps',
    '/v1/evm/pools',
    '/v1/evm/pools/ohlc',
    '/v1/evm/nft/collections',
    '/v1/evm/nft/holders',
    '/v1/evm/nft/items',
    '/v1/evm/nft/ownerships',
    '/v1/evm/nft/sales',
    '/v1/evm/nft/transfers',
    '/v1/tvm/transfers',
    '/v1/tvm/tokens',
    '/v1/tvm/transfers/native',
    '/v1/tvm/tokens/native',
    '/v1/tvm/swaps',
    '/v1/tvm/pools',
    '/v1/tvm/pools/ohlc',
    '/v1/polymarket/markets/ohlc',
    '/v1/polymarket/markets/oi',
    '/v1/polymarket/markets/activity',
    '/v1/polymarket/markets/positions',
    '/v1/polymarket/platform',
    '/v1/polymarket/users',
    '/v1/polymarket/users/positions',
] as const;

export const X402_FREE_GET_ROUTES = [
    '/v1',
    '/v1/health',
    '/v1/version',
    '/v1/networks',
    '/v1/evm/dexes',
    '/v1/svm/dexes',
    '/v1/tvm/dexes',
    '/v1/polymarket/markets',
] as const;

type X402Config = Pick<
    typeof config,
    | 'apiUrl'
    | 'x402EvmNetwork'
    | 'x402SvmNetwork'
    | 'x402EvmPayTo'
    | 'x402SvmPayTo'
    | 'x402PassDurationSeconds'
    | 'x402PassPrice'
>;

export function createX402RouteConfig(cfg: X402Config): RoutesConfig {
    return Object.fromEntries(
        X402_PROTECTED_GET_ROUTES.map((route) => [`GET ${route}`, createAccessPassRouteConfig(cfg)])
    );
}

export function isX402ProtectedRoute(method: string, path: string) {
    return method.toUpperCase() === 'GET' && X402_PROTECTED_GET_ROUTES.includes(path as X402ProtectedGetRoute);
}

type X402ProtectedGetRoute = (typeof X402_PROTECTED_GET_ROUTES)[number];

function createAccessPassRouteConfig(cfg: X402Config): RouteConfig {
    const resource = new URL(X402_ACCESS_PASS_RESOURCE_PATH, cfg.apiUrl).toString();

    return {
        resource,
        accepts: [
            {
                scheme: 'exact',
                price: cfg.x402PassPrice,
                network: cfg.x402EvmNetwork as Network,
                payTo: cfg.x402EvmPayTo,
            },
            {
                scheme: 'exact',
                price: cfg.x402PassPrice,
                network: cfg.x402SvmNetwork as Network,
                payTo: cfg.x402SvmPayTo,
            },
        ],
        description: `One-hour Token API Pro access pass. Reuse a settled payment-identifier for ${cfg.x402PassDurationSeconds} seconds of paid API access.`,
        mimeType: 'application/json',
        extensions: {
            [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(true),
            ...declareDiscoveryExtension({
                input: {
                    query: {
                        network: 'mainnet',
                        limit: 10,
                    },
                },
                output: {
                    example: {
                        data: [],
                    },
                },
            }),
        },
    };
}
