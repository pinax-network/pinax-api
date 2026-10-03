import { config } from '../config.js';
import { getSupportedRoutes } from '../supported-routes.js';

const freeRoutes = [
    '/.well-known/x402',
    '/x402.json',
    '/llms.txt',
    '/SKILL.md',
    '/skills/SKILL.md',
    '/SKILLS.md',
    '/skills.md',
    '/skill.md',
    '/openapi',
    '/v1/health',
    '/v1/version',
    '/v1/networks',
    '/v1/evm/dexes',
    '/v1/svm/dexes',
    '/v1/polymarket/markets',
    '/v1/hyperliquid/dexes',
    '/v1/hyperliquid/markets',
] as const;

const datasets = [
    {
        name: 'Token API',
        description: 'EVM and SVM token balances, transfers, holders, swaps, pools, NFT data, and metadata.',
        routePatterns: ['/v1/evm/*', '/v1/svm/*'],
    },
    {
        name: 'Prediction Markets',
        description: 'Polymarket market discovery, OHLC, open interest, activity, users, and positions.',
        routePatterns: ['/v1/polymarket/*'],
    },
    {
        name: 'Perp Exchanges',
        description:
            'Hyperliquid markets, OHLC, open interest, liquidations, user positions, vaults, and platform data.',
        routePatterns: ['/v1/hyperliquid/*'],
    },
] as const;

export function createX402Discovery(cfg = config) {
    const supported = new Set(getSupportedRoutes(cfg).supported);
    const baseUrl = cfg.apiUrl.replace(/\/$/, '');

    return {
        x402Version: 2,
        name: 'Pinax API',
        description: 'Real-time Token API, prediction market, and perp exchange data.',
        resourceServer: baseUrl,
        payment: {
            enforcement: 'proxy',
            note: 'x402 authentication, verification, settlement, and metering are handled before requests reach the API server.',
        },
        discovery: {
            openapi: `${baseUrl}/openapi`,
            llms: `${baseUrl}/llms.txt`,
            skill: `${baseUrl}/SKILL.md`,
        },
        freeRoutes: freeRoutes
            .filter((path) => !/^\/v1\/(evm|svm)\//.test(path) || supported.has(path))
            .map((path) => ({
                method: 'GET',
                path,
                resource: `${baseUrl}${path}`,
            })),
        datasets: datasets
            .map((dataset) => ({
                ...dataset,
                routePatterns: dataset.name === 'Token API' ? [...supported] : [...dataset.routePatterns],
                metering: 'proxy',
            }))
            .filter((dataset) => dataset.routePatterns.length > 0),
    };
}
