import type { config as Config } from './config.js';

type DbCategory = 'balances' | 'transfers' | 'dex' | 'nft' | 'contracts' | 'accounts' | 'metadata';

interface RouteDefinition {
    path: string;
    chain: 'evm' | 'svm';
    requires: DbCategory[];
}

/**
 * Complete mapping of API routes to their required database categories.
 * Each route requires specific DB categories to be configured for the corresponding network.
 */
export const ROUTE_DEFINITIONS: RouteDefinition[] = [
    // SVM - Tokens
    { path: '/v1/svm/transfers', chain: 'svm', requires: ['transfers', 'accounts', 'metadata'] },
    { path: '/v1/svm/balances', chain: 'svm', requires: ['balances', 'accounts', 'metadata'] },
    { path: '/v1/svm/holders', chain: 'svm', requires: ['balances', 'accounts', 'metadata'] },
    { path: '/v1/svm/owner', chain: 'svm', requires: ['accounts'] },
    { path: '/v1/svm/tokens', chain: 'svm', requires: ['balances', 'accounts', 'metadata'] },
    // SVM - Tokens (Native)
    { path: '/v1/svm/transfers/native', chain: 'svm', requires: ['transfers'] },
    { path: '/v1/svm/holders/native', chain: 'svm', requires: ['balances', 'accounts', 'metadata'] },
    { path: '/v1/svm/tokens/native', chain: 'svm', requires: ['balances'] },
    { path: '/v1/svm/balances/native', chain: 'svm', requires: ['balances'] },
    // SVM - DEXs
    { path: '/v1/svm/swaps', chain: 'svm', requires: ['dex', 'accounts', 'metadata'] },
    { path: '/v1/svm/pools', chain: 'svm', requires: ['dex', 'accounts', 'metadata'] },
    { path: '/v1/svm/pools/ohlc', chain: 'svm', requires: ['dex', 'accounts', 'metadata'] },
    { path: '/v1/svm/dexes', chain: 'svm', requires: ['dex'] },
    // EVM - Tokens
    { path: '/v1/evm/transfers', chain: 'evm', requires: ['transfers'] },
    { path: '/v1/evm/balances', chain: 'evm', requires: ['balances'] },
    { path: '/v1/evm/holders', chain: 'evm', requires: ['balances', 'contracts'] },
    { path: '/v1/evm/tokens', chain: 'evm', requires: ['balances', 'transfers'] },
    { path: '/v1/evm/balances/historical', chain: 'evm', requires: ['balances'] },
    // EVM - Tokens (Native)
    { path: '/v1/evm/transfers/native', chain: 'evm', requires: ['transfers'] },
    { path: '/v1/evm/balances/native', chain: 'evm', requires: ['balances'] },
    { path: '/v1/evm/holders/native', chain: 'evm', requires: ['balances', 'contracts'] },
    { path: '/v1/evm/tokens/native', chain: 'evm', requires: ['balances'] },
    { path: '/v1/evm/balances/historical/native', chain: 'evm', requires: ['balances'] },
    // EVM - DEXs
    { path: '/v1/evm/swaps', chain: 'evm', requires: ['dex'] },
    { path: '/v1/evm/pools', chain: 'evm', requires: ['dex'] },
    { path: '/v1/evm/pools/ohlc', chain: 'evm', requires: ['dex'] },
    { path: '/v1/evm/dexes', chain: 'evm', requires: ['dex'] },
    // EVM - NFTs
    { path: '/v1/evm/nft/collections', chain: 'evm', requires: ['contracts', 'nft'] },
    { path: '/v1/evm/nft/holders', chain: 'evm', requires: ['nft'] },
    { path: '/v1/evm/nft/items', chain: 'evm', requires: ['nft'] },
    { path: '/v1/evm/nft/ownerships', chain: 'evm', requires: ['nft'] },
    { path: '/v1/evm/nft/sales', chain: 'evm', requires: ['nft'] },
    { path: '/v1/evm/nft/transfers', chain: 'evm', requires: ['nft'] },
];

type ConfigType = typeof Config;

const DB_CATEGORY_MAP: Record<DbCategory, (cfg: ConfigType) => Record<string, unknown>> = {
    accounts: (cfg) => cfg.accountsDatabases,
    metadata: (cfg) => cfg.metadataDatabases,
    balances: (cfg) => cfg.balancesDatabases,
    transfers: (cfg) => cfg.transfersDatabases,
    dex: (cfg) => cfg.dexesDatabases,
    nft: (cfg) => cfg.nftsDatabases,
    contracts: (cfg) => cfg.contractsDatabases,
};

/**
 * Check if a route has all its required DB categories configured for at least one network of its chain type.
 */
function isRouteSupported(route: RouteDefinition, cfg: ConfigType): boolean {
    const networkList = route.chain === 'evm' ? cfg.evmNetworks : cfg.svmNetworks;

    return networkList.some((networkId) =>
        route.requires.every((category) => {
            const mapping = DB_CATEGORY_MAP[category](cfg);
            return !!mapping[networkId];
        })
    );
}

/**
 * Returns all routes grouped by support status based on the current DB configuration.
 */
export function getSupportedRoutes(cfg: ConfigType): { supported: string[]; unsupported: string[] } {
    const supported: string[] = [];
    const unsupported: string[] = [];

    for (const route of ROUTE_DEFINITIONS) {
        if (isRouteSupported(route, cfg)) {
            supported.push(route.path);
        } else {
            unsupported.push(route.path);
        }
    }

    return { supported, unsupported };
}

/**
 * Check if a specific DB category is configured for a given network.
 */
export function hasDatabase(cfg: ConfigType, networkId: string, category: DbCategory): boolean {
    const mapping = DB_CATEGORY_MAP[category](cfg);
    return !!mapping[networkId];
}
