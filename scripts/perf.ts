import { Hono } from 'hono';
import { config } from '../src/config.js';
import routes from '../src/routes/index.js';
import { hasDatabase } from '../src/supported-routes.js';
import {
    EVM_ADDRESS_NFT_OFFERER_EXAMPLE,
    EVM_ADDRESS_NFT_RECIPIENT_EXAMPLE,
    EVM_ADDRESS_SWAP_EXAMPLE,
    EVM_ADDRESS_TO_EXAMPLE,
    EVM_ADDRESS_VITALIK_EXAMPLE,
    EVM_CONTRACT_PUDGY_PENGUINS_EXAMPLE,
    EVM_CONTRACT_USDT_EXAMPLE,
    EVM_FACTORY_UNISWAP_V3_EXAMPLE,
    EVM_POOL_USDC_WETH_EXAMPLE,
    EVM_TOKEN_ID_PUDGY_PENGUIN_EXAMPLE,
    EVM_TRANSACTION_NFT_SALE_EXAMPLE,
    EVM_TRANSACTION_SWAP_EXAMPLE,
    EVM_TRANSACTION_TRANSFER_EXAMPLE,
    SVM_ADDRESS_OWNER_EXAMPLE,
    SVM_ADDRESS_USER_EXAMPLE,
    SVM_AMM_POOL_PUMP_EXAMPLE,
    SVM_AMM_RAYDIUM_V4_EXAMPLE,
    SVM_MINT_USDC_EXAMPLE,
    SVM_MINT_WSOL_EXAMPLE,
    SVM_OWNER_USER_EXAMPLE,
    SVM_TOKEN_ACCOUNT_PUMP_EXAMPLE,
    SVM_TRANSACTION_SWAP_EXAMPLE,
    SVM_TRANSACTION_TRANSFER_EXAMPLE,
} from '../src/types/examples.js';

const app = new Hono();
app.route('/', routes);

type DbCategory = 'balances' | 'transfers' | 'dex' | 'nft' | 'contracts';
type ChainType = 'evm' | 'svm';

interface BenchConfig {
    startBlock: number;
    endBlock: number;
    startTime: number;
    endTime: number;
}

// Per-network bench configs — block numbers must exist in the indexed data for each chain
// Timestamps are chain-agnostic (same real-world time), block numbers differ per chain
const BENCH: Record<string, BenchConfig> = {
    // EVM Networks
    mainnet: { startBlock: 21_000_000, endBlock: 21_000_005, startTime: 1727592950, endTime: 1727592960 },
    'arbitrum-one': { startBlock: 280_000_000, endBlock: 280_000_005, startTime: 1727592950, endTime: 1727592960 },
    bsc: { startBlock: 44_000_000, endBlock: 44_000_005, startTime: 1727592950, endTime: 1727592960 },
    base: { startBlock: 23_000_000, endBlock: 23_000_005, startTime: 1727592950, endTime: 1727592960 },
    avalanche: { startBlock: 75_000_000, endBlock: 75_000_005, startTime: 1727592950, endTime: 1727592960 },
    optimism: { startBlock: 140_000_000, endBlock: 140_000_005, startTime: 1727592950, endTime: 1727592960 },
    polygon: { startBlock: 80_000_000, endBlock: 80_000_005, startTime: 1727592950, endTime: 1727592960 },
    unichain: { startBlock: 38_000_100, endBlock: 38_000_300, startTime: 1768766360, endTime: 1768766370 },
    // SVM Networks
    solana: { startBlock: 370_000_002, endBlock: 370_000_005, startTime: 1727592950, endTime: 1727592960 },
};

// Fallbacks per chain type (uses first-defined network defaults)
const CHAIN_BENCH_DEFAULT: Record<ChainType, BenchConfig> = {
    evm: { startBlock: 21_000_000, endBlock: 21_000_005, startTime: 1727592950, endTime: 1727592960 },
    svm: { startBlock: 370_000_002, endBlock: 370_000_005, startTime: 1727592950, endTime: 1727592960 },
};

function getBench(network: string, chain: ChainType): BenchConfig {
    return BENCH[network] ?? CHAIN_BENCH_DEFAULT[chain];
}

function resolveParams(params: string | ((network: string) => string), network: string): string {
    return typeof params === 'function' ? params(network) : params;
}

// Per-network EVM examples — addresses, contracts, txs, pools, factories differ per chain
interface EvmNetworkExamples {
    contract: string; // popular ERC-20 (USDT/USDC equivalent)
    transferTx: string; // sample transfer tx
    fromAddress: string; // sample sender
    toAddress: string; // sample recipient
    swapTx: string; // sample swap tx
    factory: string; // top DEX factory
    pool: string; // top liquidity pool
    swapCaller: string; // sample swap caller/sender/recipient
    nftContract: string; // popular NFT collection
    nftTokenId: string; // sample token ID
    nftTransferTx: string; // sample NFT transfer tx
    nftOfferer: string; // sample NFT seller/from
    nftRecipient: string; // sample NFT buyer/to
}

const EVM_NETWORK_EXAMPLES: Record<string, EvmNetworkExamples> = {
    mainnet: {
        contract: EVM_CONTRACT_USDT_EXAMPLE, // USDT
        transferTx: EVM_TRANSACTION_TRANSFER_EXAMPLE,
        fromAddress: EVM_ADDRESS_VITALIK_EXAMPLE,
        toAddress: EVM_ADDRESS_TO_EXAMPLE,
        swapTx: EVM_TRANSACTION_SWAP_EXAMPLE,
        factory: EVM_FACTORY_UNISWAP_V3_EXAMPLE, // Uniswap V3
        pool: EVM_POOL_USDC_WETH_EXAMPLE, // USDC/WETH
        swapCaller: EVM_ADDRESS_SWAP_EXAMPLE,
        nftContract: EVM_CONTRACT_PUDGY_PENGUINS_EXAMPLE, // Pudgy Penguins
        nftTokenId: EVM_TOKEN_ID_PUDGY_PENGUIN_EXAMPLE,
        nftTransferTx: EVM_TRANSACTION_NFT_SALE_EXAMPLE,
        nftOfferer: EVM_ADDRESS_NFT_OFFERER_EXAMPLE,
        nftRecipient: EVM_ADDRESS_NFT_RECIPIENT_EXAMPLE,
    },
    base: {
        contract: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
        transferTx: '0x4c16e19092941818b66abf33f1e617a7fe38139d368cfdac830c4aeba801faaf',
        fromAddress: '0xfd78ee919681417d192449715b2594ab58f5d002',
        toAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        swapTx: '0xa745f8345b6076a9d614e05e012fe5441c5f3f8264cc905ebdc1536e4f42370b',
        factory: '0x8909dc15e40173ff4699343b6eb8132c65e18ec6', // Aerodrome
        pool: '0xb4cb800910b228ed3d0834cf79d697127bbb00e5',
        swapCaller: '0xcaf2da315f5a5499299a312b8a86faafe4bad959',
        nftContract: '0xd4307e0acd12cf46fd6cf93bc264f5d5d1598792', // Base Onchain Summer
        nftTokenId: '1',
        nftTransferTx: '0x0000000000000000000000000000000000000000000000000000000000000000',
        nftOfferer: '0x0000000000000000000000000000000000000000',
        nftRecipient: '0x0000000000000000000000000000000000000000',
    },
    bsc: {
        contract: '0x55d398326f99059ff775485246999027b3197955', // USDT
        transferTx: '0x2737cf9716e8cafa9ead9a4ca33974205e9f111c3868fc46dea8909739d8c353',
        fromAddress: '0xd5825b9e771bac21eaa89e2138b70c9faea4be6b',
        toAddress: '0x6d3ebc288a9ff9aa2d852d52b79946760eb17671',
        swapTx: '0x8298d13e67ac42408c6960f7cdd0ec0b45859e30959efb1b2f46b38229807d17',
        factory: '0xca143ce32fe78f1f7019d7d551a6402fc5350c73', // PancakeSwap V2
        pool: '0x16b9a82891338f9ba80e2d6970fdda79d1eb0dae',
        swapCaller: '0x9999b0cdd35d7f3b281ba02efc0d228486940515',
        nftContract: '0x0a8901b0e25deb55a87524f0cc164e9644020eba', // PancakeSwap Bunnies
        nftTokenId: '1',
        nftTransferTx: '0x0000000000000000000000000000000000000000000000000000000000000000',
        nftOfferer: '0x0000000000000000000000000000000000000000',
        nftRecipient: '0x0000000000000000000000000000000000000000',
    },
    'arbitrum-one': {
        contract: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // USDC
        transferTx: '0xb4f5e28ced25edf949861bf5b62ad911c892d4ff5bb8a25093ed8a07e903ed9b',
        fromAddress: '0x85304ba7b9ade0268014e07bbcc2f368c2cda335',
        toAddress: '0x3d784b0067ad72f0b271e9d0bd4c69ea7d40ae12',
        swapTx: '0x9c795270b1547ea9a65d91e2d1dedf92135378ad6518d82c5f1877df7ca0e65e',
        factory: '0x1f98431c8ad98523631ae4a59f267346ea31f984', // Uniswap V3
        pool: '0xc6962004f452be9203591991d15f6b388e09e8d0',
        swapCaller: '0x27920e8039d2b6e93e36f5d5f53b998e2e631a70',
        nftContract: '0xfae39ec09730ca0f14262a636d2d7c5539353752', // Smol Brains
        nftTokenId: '1',
        nftTransferTx: '0x0000000000000000000000000000000000000000000000000000000000000000',
        nftOfferer: '0x0000000000000000000000000000000000000000',
        nftRecipient: '0x0000000000000000000000000000000000000000',
    },
    avalanche: {
        contract: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e', // USDC
        transferTx: '0xad2a06d95d84eeefbfe8c6ba54f14ac3a34f300e0f3f135e716ca0a4c8f94fcd',
        fromAddress: '0xfd78ee919681417d192449715b2594ab58f5d002',
        toAddress: '0x487a305e32cb7c5a7564fdec6b7920057fe7de4a',
        swapTx: '0xd4e5e330f9b1f5b1886a83b9f529c43990f94c21074dfca583cf915b06139a52',
        factory: '0x9ad6c38be94206ca50bb0d90783181662f0cfa10', // TraderJoe
        pool: '0xfae3f424a0a47706811521e3ee268f00cfb5c45e',
        swapCaller: '0x808ce8dec9e10bed8d0892aceef9f1b8ec2f52bd',
        nftContract: '0x4245a1bd84eb5f3ebc115b2e169c99cc898305ce', // Chill Penguins
        nftTokenId: '1',
        nftTransferTx: '0x0000000000000000000000000000000000000000000000000000000000000000',
        nftOfferer: '0x0000000000000000000000000000000000000000',
        nftRecipient: '0x0000000000000000000000000000000000000000',
    },
    optimism: {
        contract: '0x4200000000000000000000000000000000000006', // WETH
        transferTx: '0xcc902c6571bee8366cbead0d821d70e5696258412bf6a5d7243e3ca5ed24228a',
        fromAddress: '0x5520385bfcf07ec87c4c53a7d8d65595dff69fa4',
        toAddress: '0x000010036c0190e009a000d0fc3541100a07380a',
        swapTx: '0x47cc220af6845d3048366d183dd136d128cb985e1c27296b7078ff6f22f74448',
        factory: '0x1f98431c8ad98523631ae4a59f267346ea31f984', // Uniswap V3
        pool: '0xd1f1bad4c9e6c44dec1e9bf3b94902205c5cd6c3',
        swapCaller: '0x549f7822e78b783720c86513f14a38a7dbceda28',
        nftContract: '0xb8df6cc3050cc02f967db1ee48330ba23276a492', // OptiPunk
        nftTokenId: '1',
        nftTransferTx: '0x0000000000000000000000000000000000000000000000000000000000000000',
        nftOfferer: '0x0000000000000000000000000000000000000000',
        nftRecipient: '0x0000000000000000000000000000000000000000',
    },
    polygon: {
        contract: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // USDC.e
        transferTx: '0xb8b4d1d7b174132f8864b3f1077310cfc9e6b8f4727b164126ff29df56ec9889',
        fromAddress: '0xece6886c64c3ac8f83e302a6a71fcb015135d298',
        toAddress: '0x71c1dd2a39ca3581a3ab647f715c769708197f52',
        swapTx: '0x228c4a4568b510bf63c3f30a5cc4899dfa90d85f80acde988545437161d0ddc0',
        factory: '0x5757371414417b8c6caad45baef941abc7d3ab32', // QuickSwap
        pool: '0x882df4b0fb50a229c3b4124eb18c759911485bfb',
        swapCaller: '0xee2a7b2c72217f6ebf0401dabb407c7a600d910f',
        nftContract: '0xa5f1ea7df861952863df2e8d1312f7305dabf215', // ZED RUN
        nftTokenId: '1',
        nftTransferTx: '0x0000000000000000000000000000000000000000000000000000000000000000',
        nftOfferer: '0x0000000000000000000000000000000000000000',
        nftRecipient: '0x0000000000000000000000000000000000000000',
    },
    unichain: {
        contract: '0x4200000000000000000000000000000000000006', // WETH
        transferTx: '0x5ad0c0da4c43c03376859e1a08e9dc6ae21eadd82ca86c0e79e1dff32d40ee09',
        fromAddress: '0x4d73a4411ca1c660035e4aecc8270e5dddec8c17',
        toAddress: '0x65081cb48d74a32e9ccfed75164b8c09972dbcf1',
        swapTx: '0x40b02dd08d9cf4813079a02d6e25c8ba52beeb49d2c7352a87427f1e39e0cba6',
        factory: '0x1f98400000000000000000000000000000000004', // Uniswap V4
        pool: '0x9bdd72519ad7e2b5f0d5441d7af389771cc04a8406cd577fac0c68a8b6b396bd',
        swapCaller: '0xec9da8a9ed3eefe99f5d675562764a8e1d77a14e',
        nftContract: '0x0000000000000000000000000000000000000000', // no major NFT on unichain yet
        nftTokenId: '1',
        nftTransferTx: '0x0000000000000000000000000000000000000000000000000000000000000000',
        nftOfferer: '0x0000000000000000000000000000000000000000',
        nftRecipient: '0x0000000000000000000000000000000000000000',
    },
};

function getEvmExamples(network: string): EvmNetworkExamples {
    return EVM_NETWORK_EXAMPLES[network] ?? (EVM_NETWORK_EXAMPLES.mainnet as EvmNetworkExamples);
}

interface PerfRoute {
    path: string;
    chain: ChainType;
    params: string | ((network: string) => string);
    requires: DbCategory[];
}

/**
 * Generates 7 filter-combination variants for a route that supports
 * start_block / end_block / start_time / end_time:
 *   1. no filter
 *   2. start_block only
 *   3. end_block only
 *   4. start_block + end_block
 *   5. start_time only
 *   6. end_time only
 *   7. start_time + end_time
 *
 * Block numbers are resolved per-network at runtime via getBench().
 */
function timeBlockVariants(
    path: string,
    chain: ChainType,
    requires: DbCategory[],
    extraParams: string | ((network: string) => string) = ''
): PerfRoute[] {
    const resolve = (n: string) => {
        const ep = typeof extraParams === 'function' ? extraParams(n) : extraParams;
        return ep ? `${ep}&` : '';
    };
    return [
        { path, chain, params: extraParams, requires },
        { path, chain, params: (n) => `${resolve(n)}start_block=${getBench(n, chain).startBlock}`, requires },
        { path, chain, params: (n) => `${resolve(n)}end_block=${getBench(n, chain).endBlock}`, requires },
        {
            path,
            chain,
            params: (n) =>
                `${resolve(n)}start_block=${getBench(n, chain).startBlock}&end_block=${getBench(n, chain).endBlock}`,
            requires,
        },
        { path, chain, params: (n) => `${resolve(n)}start_time=${getBench(n, chain).startTime}`, requires },
        { path, chain, params: (n) => `${resolve(n)}end_time=${getBench(n, chain).endTime}`, requires },
        {
            path,
            chain,
            params: (n) =>
                `${resolve(n)}start_time=${getBench(n, chain).startTime}&end_time=${getBench(n, chain).endTime}`,
            requires,
        },
    ];
}

/**
 * Generates variants for a route where each filter param is tested individually.
 * This ensures clamped_start_ts is properly disabled when any filter is active.
 */
function filterVariants(
    path: string,
    chain: ChainType,
    requires: DbCategory[],
    filters: Record<string, string | ((network: string) => string)>
): PerfRoute[] {
    return Object.entries(filters).map(([key, value]) => ({
        path,
        chain,
        params: typeof value === 'function' ? (n: string) => `${key}=${value(n)}` : `${key}=${value}`,
        requires,
    }));
}

// Route definitions with query parameters (excluding network) matching the test suite
const PERF_ROUTES: PerfRoute[] = [
    // EVM Tokens
    {
        path: '/v1/evm/tokens',
        chain: 'evm',
        params: (n) => `contract=${getEvmExamples(n).contract}`,
        requires: ['balances', 'transfers'],
    },
    { path: '/v1/evm/tokens/native', chain: 'evm', params: '', requires: ['balances'] },
    // SVM Tokens
    { path: '/v1/svm/tokens', chain: 'svm', params: `mint=${SVM_MINT_WSOL_EXAMPLE}`, requires: ['balances'] },
    // EVM Balances
    {
        path: '/v1/evm/balances',
        chain: 'evm',
        params: `address=${EVM_ADDRESS_VITALIK_EXAMPLE}`,
        requires: ['balances'],
    },
    {
        path: '/v1/evm/balances/native',
        chain: 'evm',
        params: `address=${EVM_ADDRESS_VITALIK_EXAMPLE}`,
        requires: ['balances'],
    },
    {
        path: '/v1/evm/balances/historical',
        chain: 'evm',
        params: `address=${EVM_ADDRESS_VITALIK_EXAMPLE}`,
        requires: ['balances'],
    },
    {
        path: '/v1/evm/balances/historical/native',
        chain: 'evm',
        params: `address=${EVM_ADDRESS_VITALIK_EXAMPLE}`,
        requires: ['balances'],
    },
    // SVM Balances
    { path: '/v1/svm/balances', chain: 'svm', params: `owner=${SVM_OWNER_USER_EXAMPLE}`, requires: ['balances'] },
    {
        path: '/v1/svm/balances/native',
        chain: 'svm',
        params: `address=${SVM_ADDRESS_OWNER_EXAMPLE}`,
        requires: ['balances'],
    },
    // EVM Transfers
    ...timeBlockVariants('/v1/evm/transfers', 'evm', ['transfers']),
    ...filterVariants('/v1/evm/transfers', 'evm', ['transfers'], {
        transaction_id: (n) => getEvmExamples(n).transferTx,
        contract: (n) => getEvmExamples(n).contract,
        from_address: (n) => getEvmExamples(n).fromAddress,
        to_address: (n) => getEvmExamples(n).toAddress,
    }),
    ...timeBlockVariants('/v1/evm/transfers', 'evm', ['transfers'], (n) => `contract=${getEvmExamples(n).contract}`),
    { path: '/v1/evm/transfers/native', chain: 'evm', params: '', requires: ['transfers'] },
    // SVM Transfers
    ...timeBlockVariants('/v1/svm/transfers', 'svm', ['transfers']),
    ...filterVariants('/v1/svm/transfers', 'svm', ['transfers'], {
        signature: SVM_TRANSACTION_TRANSFER_EXAMPLE,
        mint: SVM_MINT_WSOL_EXAMPLE,
        authority: SVM_OWNER_USER_EXAMPLE,
    }),
    ...timeBlockVariants('/v1/svm/transfers', 'svm', ['transfers'], `mint=${SVM_MINT_WSOL_EXAMPLE}`),
    // EVM Holders
    {
        path: '/v1/evm/holders',
        chain: 'evm',
        params: (n) => `contract=${getEvmExamples(n).contract}`,
        requires: ['balances'],
    },
    { path: '/v1/evm/holders/native', chain: 'evm', params: '', requires: ['balances'] },
    // SVM Holders
    { path: '/v1/svm/holders', chain: 'svm', params: `mint=${SVM_MINT_WSOL_EXAMPLE}`, requires: ['balances'] },
    // EVM Swaps
    ...timeBlockVariants('/v1/evm/swaps', 'evm', ['dex']),
    ...filterVariants('/v1/evm/swaps', 'evm', ['dex'], {
        transaction_id: (n) => getEvmExamples(n).swapTx,
        factory: (n) => getEvmExamples(n).factory,
        pool: (n) => getEvmExamples(n).pool,
        caller: (n) => getEvmExamples(n).swapCaller,
        sender: (n) => getEvmExamples(n).swapCaller,
        recipient: (n) => getEvmExamples(n).swapCaller,
        input_contract: (n) => getEvmExamples(n).contract,
        output_contract: (n) => getEvmExamples(n).contract,
    }),
    ...timeBlockVariants('/v1/evm/swaps', 'evm', ['dex'], (n) => `pool=${getEvmExamples(n).pool}`),
    // SVM Swaps
    ...timeBlockVariants('/v1/svm/swaps', 'svm', ['dex']),
    ...filterVariants('/v1/svm/swaps', 'svm', ['dex'], {
        signature: SVM_TRANSACTION_SWAP_EXAMPLE,
        amm: SVM_AMM_RAYDIUM_V4_EXAMPLE,
        amm_pool: SVM_AMM_POOL_PUMP_EXAMPLE,
        user: SVM_ADDRESS_USER_EXAMPLE,
        input_mint: SVM_MINT_WSOL_EXAMPLE,
        output_mint: SVM_MINT_USDC_EXAMPLE,
    }),
    ...timeBlockVariants('/v1/svm/swaps', 'svm', ['dex'], `amm_pool=${SVM_AMM_POOL_PUMP_EXAMPLE}`),
    // EVM DEXes
    { path: '/v1/evm/dexes', chain: 'evm', params: '', requires: ['dex'] },
    // SVM DEXes
    { path: '/v1/svm/dexes', chain: 'svm', params: '', requires: ['dex'] },
    // EVM Pools
    { path: '/v1/evm/pools', chain: 'evm', params: '', requires: ['dex'] },
    // SVM Pools
    { path: '/v1/svm/pools', chain: 'svm', params: '', requires: ['dex'] },
    // EVM OHLCV
    { path: '/v1/evm/pools/ohlc', chain: 'evm', params: (n) => `pool=${getEvmExamples(n).pool}`, requires: ['dex'] },
    // SVM OHLCV
    {
        path: '/v1/svm/pools/ohlc',
        chain: 'svm',
        params: `amm_pool=${SVM_AMM_POOL_PUMP_EXAMPLE}`,
        requires: ['dex', 'balances'],
    },
    // SVM Owner
    {
        path: '/v1/svm/owner',
        chain: 'svm',
        params: `account=${SVM_TOKEN_ACCOUNT_PUMP_EXAMPLE}`,
        requires: ['balances'],
    },
    // EVM NFT
    {
        path: '/v1/evm/nft/collections',
        chain: 'evm',
        params: (n) => `contract=${getEvmExamples(n).nftContract}`,
        requires: ['contracts', 'nft'],
    },
    {
        path: '/v1/evm/nft/holders',
        chain: 'evm',
        params: (n) => `contract=${getEvmExamples(n).nftContract}`,
        requires: ['nft'],
    },
    {
        path: '/v1/evm/nft/items',
        chain: 'evm',
        params: (n) => `contract=${getEvmExamples(n).nftContract}`,
        requires: ['nft'],
    },
    {
        path: '/v1/evm/nft/ownerships',
        chain: 'evm',
        params: (n) => `address=${getEvmExamples(n).nftOfferer}`,
        requires: ['nft'],
    },
    { path: '/v1/evm/nft/sales', chain: 'evm', params: '', requires: ['nft'] },
    ...timeBlockVariants('/v1/evm/nft/transfers', 'evm', ['nft']),
    ...filterVariants('/v1/evm/nft/transfers', 'evm', ['nft'], {
        type: 'TRANSFER',
        transaction_id: (n) => getEvmExamples(n).nftTransferTx,
        contract: (n) => getEvmExamples(n).nftContract,
        token_id: (n) => getEvmExamples(n).nftTokenId,
        address: (n) => getEvmExamples(n).nftOfferer,
        from_address: (n) => getEvmExamples(n).nftOfferer,
        to_address: (n) => getEvmExamples(n).nftRecipient,
    }),
    ...timeBlockVariants('/v1/evm/nft/transfers', 'evm', ['nft'], (n) => `contract=${getEvmExamples(n).nftContract}`),
];

function getNetworksForChain(chain: ChainType): string[] {
    switch (chain) {
        case 'evm':
            return config.evmNetworks;
        case 'svm':
            return config.svmNetworks;
        default:
            throw new Error(`Unknown chain type: ${chain}`);
    }
}

interface PerfResult {
    route: string;
    network: string;
    status: number;
    duration_ms: number;
    rows: number;
}

function getStatusEmoji(status: number, duration_ms: number, rows: number): string {
    if (status !== 200) return '❌';
    if (duration_ms > 2000) return '❌';
    if (rows === 0) return '💀';
    if (duration_ms > 500) return '⚠️ ';
    return '✅';
}

function parseArgs(argv: string[]): { path?: string; chain?: ChainType; noCache?: boolean; delay?: number } {
    const args = argv.slice(2);
    const result: { path?: string; chain?: ChainType; noCache?: boolean; delay?: number } = {};

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--path' && args[i + 1]) {
            result.path = args[++i];
        } else if (args[i] === '--chain' && args[i + 1]) {
            result.chain = args[++i] as ChainType;
        } else if (args[i] === '--no-cache') {
            result.noCache = true;
        } else if (args[i] === '--delay' && args[i + 1]) {
            result.delay = Number.parseInt(args[++i] as string, 10);
        } else if (!args[i]?.startsWith('-')) {
            result.path = args[i];
        }
    }
    return result;
}

async function runPerf() {
    const filters = parseArgs(process.argv);
    const hasFilters = filters.path || filters.chain;

    // Override query cache at runtime
    if (filters.noCache) {
        // biome-ignore lint/suspicious/noExplicitAny: runtime override for benchmarking
        (config as any).disableCache = true;
    }

    const activeRoutes = PERF_ROUTES.filter((r) => {
        if (filters.chain && r.chain !== filters.chain) return false;
        if (filters.path && !r.path.includes(filters.path)) return false;
        return true;
    });

    if (activeRoutes.length === 0) {
        console.log(`No routes matched filters: ${JSON.stringify(filters)}`);
        console.log('\nUsage: bun run scripts/perf.ts [--path <substring>] [--chain <evm|svm>]');
        console.log('\nExamples:');
        console.log('  bun run scripts/perf.ts --chain evm');
        console.log('  bun run scripts/perf.ts --path swaps');
        console.log('  bun run scripts/perf.ts --path swaps --chain svm');
        console.log('  bun run scripts/perf.ts swaps');
        process.exit(1);
    }

    if (hasFilters || filters.noCache) {
        const parts = [
            filters.path && `path=${filters.path}`,
            filters.chain && `chain=${filters.chain}`,
            filters.noCache && 'cache=off',
        ].filter(Boolean);
        console.log(`Filter: ${parts.join(', ')}  (${activeRoutes.length}/${PERF_ROUTES.length} routes)\n`);
    }

    const results: PerfResult[] = [];
    const skipped: { path: string; network: string }[] = [];

    // Build the list of (route, network) pairs for alignment
    const routeNetworkLabels: { path: string; network: string }[] = [];
    for (const route of activeRoutes) {
        for (const network of getNetworksForChain(route.chain)) {
            routeNetworkLabels.push({ path: route.path, network });
        }
    }
    let maxPathLen = 0;
    for (const route of activeRoutes) {
        for (const network of getNetworksForChain(route.chain)) {
            const p = resolveParams(route.params, network);
            const len = p ? `${route.path}?${p}`.length : route.path.length;
            maxPathLen = Math.max(maxPathLen, len);
        }
    }
    const maxNetworkLen = Math.max(...routeNetworkLabels.map((r) => r.network.length));

    for (const route of activeRoutes) {
        const networks = getNetworksForChain(route.chain);

        for (const network of networks) {
            const hasAllDbs = route.requires.every((category) => hasDatabase(config, network, category));
            if (!hasAllDbs) {
                skipped.push({ path: route.path, network });
                continue;
            }

            const params = resolveParams(route.params, network);
            const query = params ? `network=${network}&${params}` : `network=${network}`;
            const url = `${route.path}?${query}`;
            const start = performance.now();
            try {
                const response = await app.request(url, { headers: { 'X-Plan': 'free', 'Cache-Control': 'no-cache' } });
                const body = await response.json();
                const duration_ms = Math.round((performance.now() - start) * 100) / 100;
                const rows = Array.isArray(body?.data) ? body.data.length : 0;

                results.push({ route: route.path, network, status: response.status, duration_ms, rows });
                const emoji = getStatusEmoji(response.status, duration_ms, rows);
                const label = params ? `${route.path}?${params}` : route.path;
                const paddedPath = label.padEnd(maxPathLen);
                const paddedNetwork = `[${network}]`.padEnd(maxNetworkLen + 2);
                const paddedTime = `${duration_ms}ms`.padStart(12);
                console.log(`${emoji} ${paddedPath}  ${paddedNetwork}  ${paddedTime}  (${rows} rows)`);
            } catch (err) {
                const duration_ms = Math.round((performance.now() - start) * 100) / 100;
                results.push({ route: route.path, network, status: 0, duration_ms, rows: 0 });
                const label = params ? `${route.path}?${params}` : route.path;
                const paddedPath = label.padEnd(maxPathLen);
                const paddedNetwork = `[${network}]`.padEnd(maxNetworkLen + 2);
                const paddedTime = `${duration_ms}ms`.padStart(12);
                console.log(`❌ ${paddedPath}  ${paddedNetwork}  ${paddedTime}  (error: ${err})`);
            }

            // Delay between queries to avoid overwhelming ClickHouse
            if (filters.delay) {
                await new Promise((r) => setTimeout(r, filters.delay));
            }
        }
    }

    // Summary
    console.log('\n--- Summary ---');
    console.log(`Total: ${results.length} queries tested, ${skipped.length} skipped`);

    if (results.length > 0) {
        const totalTime = results.reduce((sum, r) => sum + r.duration_ms, 0);
        const avgTime = Math.round((totalTime / results.length) * 100) / 100;
        const failed = results.filter((r) => r.status !== 200);

        console.log(`Total time: ${Math.round(totalTime * 100) / 100}ms`);
        console.log(`Average: ${avgTime}ms`);

        // Top 3 fastest & slowest
        const sorted = [...results].sort((a, b) => a.duration_ms - b.duration_ms);
        const top3Fastest = sorted.slice(0, 3);
        const top3Slowest = sorted.slice(-3).reverse();

        console.log('\n🏎️  Top 3 Fastest:');
        for (const r of top3Fastest) {
            console.log(`  ${r.route} [${r.network}] — ${r.duration_ms}ms`);
        }

        console.log('\n🐢 Top 3 Slowest:');
        for (const r of top3Slowest) {
            console.log(`  ${r.route} [${r.network}] — ${r.duration_ms}ms`);
        }

        if (failed.length > 0) {
            console.log(`\n❌ Failed queries (${failed.length}):`);
            for (const f of failed) {
                console.log(`  ${f.route} [${f.network}] — HTTP ${f.status}`);
            }
        }

        const dead = results.filter((r) => r.status === 200 && r.rows === 0);
        if (dead.length > 0) {
            console.log(`\n💀 No rows returned (${dead.length}):`);
            for (const d of dead) {
                console.log(`  ${d.route} [${d.network}] — ${d.duration_ms}ms`);
            }
        }
    }

    if (skipped.length > 0) {
        console.log(`\nSkipped queries (no DB configured):`);
        for (const s of skipped) {
            console.log(`  ${s.path} [${s.network}]`);
        }
    }
}

runPerf().catch((err) => {
    console.error('Perf test failed:', err);
    process.exit(1);
});
