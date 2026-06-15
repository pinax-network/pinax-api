import { Hono } from 'hono';
import { cacheControl } from '../middleware/cacheControl.js';
import { normalizeProtocolQuery } from '../middleware/normalizeProtocolQuery.js';
// Balances
import evmBalances from './balances/evm.js';
// import tvmBalancesNative from './balances/tvm_native.js';
import evmBalancesHistorical from './balances/evm_historical.js';
// import tvmBalancesHistorical from './balances/tvm_historical.js';
import evmBalancesHistoricalNative from './balances/evm_historical_native.js';
// import tvmBalances from './balances/tvm.js';
import evmBalancesNative from './balances/evm_native.js';
import svmBalances from './balances/svm.js';
import svmBalancesNative from './balances/svm_native.js';
// Monitoring
import health from './health.js';
import networks from './networks.js';
// Tokens
import evmTokens from './tokens/evm.js';
import evmTokensNative from './tokens/evm_native.js';
import svmTokens from './tokens/svm.js';
import svmTokensNative from './tokens/svm_native.js';
import tvmTokens from './tokens/tvm.js';
import tvmTokensNative from './tokens/tvm_native.js';
import version from './version.js';

// import tvmBalancesHistoricalNative from './balances/tvm_historical_native.js';

// DEXes
import evmDexes from './dexes/evm.js';
import svmDexes from './dexes/svm.js';
import tvmDexes from './dexes/tvm.js';
// Holders
import evmHolders from './holders/evm.js';
// import tvmHolders from './holders/tvm.js';
import evmHoldersNative from './holders/evm_native.js';
import svmHolders from './holders/svm.js';
import svmHoldersNative from './holders/svm_native.js';
// Hyperliquid
import hyperliquidDexes from './hyperliquid/dexes.js';
import hyperliquidMarkets from './hyperliquid/markets.js';
import hyperliquidMarketsActivity from './hyperliquid/markets_activity.js';
import hyperliquidMarketsLiquidations from './hyperliquid/markets_liquidations.js';
import hyperliquidMarketsLiquidationsOhlc from './hyperliquid/markets_liquidations_ohlc.js';
import hyperliquidMarketsOhlc from './hyperliquid/markets_ohlc.js';
import hyperliquidMarketsOi from './hyperliquid/markets_oi.js';
import hyperliquidOutcomes from './hyperliquid/outcomes.js';
import hyperliquidOutcomesOhlc from './hyperliquid/outcomes_ohlc.js';
import hyperliquidOutcomesTrades from './hyperliquid/outcomes_trades.js';
import hyperliquidOutcomesUsers from './hyperliquid/outcomes_users.js';
import hyperliquidPlatform from './hyperliquid/platform.js';
import hyperliquidUsers from './hyperliquid/users.js';
import hyperliquidUsersActivity from './hyperliquid/users_activity.js';
import hyperliquidUsersPositions from './hyperliquid/users_positions.js';
import hyperliquidVaults from './hyperliquid/vaults.js';
import hyperliquidVaultsDepositors from './hyperliquid/vaults_depositors.js';
// NFT
import nftCollections from './nft/collections_evm.js';
import nftHolders from './nft/holders_evm.js';
import nftItems from './nft/items_evm.js';
import nftOwnerships from './nft/ownerships_evm.js';
import nftSales from './nft/sales_evm.js';
import nftTransfers from './nft/transfers_evm.js';
// OHLCV
import evmOhlcv from './ohlcv/evm.js';
import svmOhlcv from './ohlcv/svm.js';
import tvmOhlcv from './ohlcv/tvm.js';
// Owner
import svmOwner from './owner/svm.js';
// Polymarket
import polymarketActivity from './polymarket/activity.js';
import polymarketMarketPositions from './polymarket/market_positions.js';
import polymarketMarkets from './polymarket/markets.js';
import polymarketOhlcv from './polymarket/ohlcv.js';
import polymarketOi from './polymarket/oi.js';
import polymarketPlatform from './polymarket/platform.js';
import polymarketPositions from './polymarket/positions.js';
import polymarketUsers from './polymarket/users.js';
// Pools
import evmPools from './pools/evm.js';
import svmPools from './pools/svm.js';
import tvmPools from './pools/tvm.js';
// Swaps
import evmSwaps from './swaps/evm.js';
import svmSwaps from './swaps/svm.js';
import tvmSwaps from './swaps/tvm.js';
// Transfers
import evmTransfers from './transfers/evm.js';
import evmTransfersNative from './transfers/evm_native.js';
import svmTransfers from './transfers/svm.js';
import svmTransfersNative from './transfers/svm_native.js';
import tvmTransfers from './transfers/tvm.js';
import tvmTransfersNative from './transfers/tvm_native.js';

const router = new Hono();

// --- Query normalization middleware ---
// Normalize request query parameters before validation/route handling.
router.use('/v1/*', normalizeProtocolQuery);

// --- HTTP Cache-Control middleware ---
// Default: all /v1/* routes get a minimal 1s cache (no SWR).
// Specific routes below override with longer env-configured TTLs.
router.use('/v1/*');
router.use('/v1/*/holders', cacheControl());
router.use('/v1/*/holders/native', cacheControl());
router.use('/v1/*/dexes', cacheControl());
router.use('/v1/*/tokens', cacheControl());
router.use('/v1/*/tokens/native', cacheControl());
router.use('/v1/*/pools', cacheControl());
router.use('/v1/*/pools/ohlc', cacheControl());
router.use('/v1/*/nft/collections', cacheControl());
router.use('/v1/*/nft/holders', cacheControl());
router.use('/v1/*/balances/historical', cacheControl());
router.use('/v1/*/balances/historical/native', cacheControl());

// SVM - Tokens
router.route('/v1/svm/transfers', svmTransfers);
router.route('/v1/svm/balances', svmBalances);
router.route('/v1/svm/holders', svmHolders);
router.route('/v1/svm/owner', svmOwner);
router.route('/v1/svm/tokens', svmTokens);
// SVM - Tokens (Native)
router.route('/v1/svm/transfers/native', svmTransfersNative);
router.route('/v1/svm/balances/native', svmBalancesNative);
router.route('/v1/svm/holders/native', svmHoldersNative);
router.route('/v1/svm/tokens/native', svmTokensNative);

// SVM - DEXs
router.route('/v1/svm/swaps', svmSwaps);
router.route('/v1/svm/pools', svmPools);
router.route('/v1/svm/pools/ohlc', svmOhlcv);
router.route('/v1/svm/dexes', svmDexes);

// EVM - Tokens
router.route('/v1/evm/transfers', evmTransfers);
router.route('/v1/evm/balances', evmBalances);
router.route('/v1/evm/holders', evmHolders);
router.route('/v1/evm/tokens', evmTokens);
router.route('/v1/evm/balances/historical', evmBalancesHistorical);
// EVM - Tokens (Native)
router.route('/v1/evm/transfers/native', evmTransfersNative);
router.route('/v1/evm/balances/native', evmBalancesNative);
router.route('/v1/evm/holders/native', evmHoldersNative);
router.route('/v1/evm/tokens/native', evmTokensNative);
router.route('/v1/evm/balances/historical/native', evmBalancesHistoricalNative);
// EVM - DEXs
router.route('/v1/evm/swaps', evmSwaps);
router.route('/v1/evm/pools', evmPools);
router.route('/v1/evm/pools/ohlc', evmOhlcv);
router.route('/v1/evm/dexes', evmDexes);
// EVM - NFTs
router.route('/v1/evm/nft/collections', nftCollections);
router.route('/v1/evm/nft/holders', nftHolders);
router.route('/v1/evm/nft/items', nftItems);
router.route('/v1/evm/nft/ownerships', nftOwnerships);
router.route('/v1/evm/nft/sales', nftSales);
router.route('/v1/evm/nft/transfers', nftTransfers);

// TVM - Tokens
router.route('/v1/tvm/transfers', tvmTransfers);
// router.route('/v1/tvm/balances', tvmBalances);
// router.route('/v1/tvm/holders', tvmHolders);
router.route('/v1/tvm/tokens', tvmTokens);
// router.route('/v1/tvm/balances/historical', tvmBalancesHistorical);
// TVM - Tokens (Native)
router.route('/v1/tvm/transfers/native', tvmTransfersNative);
// router.route('/v1/tvm/balances/native', tvmBalancesNative);
router.route('/v1/tvm/tokens/native', tvmTokensNative);
// router.route('/v1/tvm/balances/historical/native', tvmBalancesHistoricalNative);
// TVM - DEXs
router.route('/v1/tvm/swaps', tvmSwaps);
router.route('/v1/tvm/pools', tvmPools);
router.route('/v1/tvm/pools/ohlc', tvmOhlcv);
router.route('/v1/tvm/dexes', tvmDexes);

// Hyperliquid
// Selective caching: snapshot / slow-changing endpoints only. Time-series and
// event-stream routes (ohlc, oi, activity, liquidations, positions, platform)
// are uncached because the default s-maxage=600 would surface stale 1m candles
// and real-time data. See project_hyperliquid_scoping.md for the full list.
router.use('/v1/hyperliquid/dexes', cacheControl());
router.use('/v1/hyperliquid/markets', cacheControl());
router.use('/v1/hyperliquid/outcomes', cacheControl());
router.use('/v1/hyperliquid/users', cacheControl());
router.use('/v1/hyperliquid/vaults', cacheControl());
router.use('/v1/hyperliquid/vaults/depositors', cacheControl());
router.route('/v1/hyperliquid/dexes', hyperliquidDexes);
router.route('/v1/hyperliquid/markets', hyperliquidMarkets);
router.route('/v1/hyperliquid/markets/ohlc', hyperliquidMarketsOhlc);
router.route('/v1/hyperliquid/markets/oi', hyperliquidMarketsOi);
router.route('/v1/hyperliquid/markets/activity', hyperliquidMarketsActivity);
router.route('/v1/hyperliquid/markets/liquidations', hyperliquidMarketsLiquidations);
router.route('/v1/hyperliquid/markets/liquidations/ohlc', hyperliquidMarketsLiquidationsOhlc);
router.route('/v1/hyperliquid/outcomes', hyperliquidOutcomes);
router.route('/v1/hyperliquid/outcomes/ohlc', hyperliquidOutcomesOhlc);
router.route('/v1/hyperliquid/outcomes/trades', hyperliquidOutcomesTrades);
router.route('/v1/hyperliquid/outcomes/users', hyperliquidOutcomesUsers);
router.route('/v1/hyperliquid/users', hyperliquidUsers);
router.route('/v1/hyperliquid/users/positions', hyperliquidUsersPositions);
router.route('/v1/hyperliquid/users/activity', hyperliquidUsersActivity);
router.route('/v1/hyperliquid/vaults', hyperliquidVaults);
router.route('/v1/hyperliquid/vaults/depositors', hyperliquidVaultsDepositors);
router.route('/v1/hyperliquid/platform', hyperliquidPlatform);

// Polymarket
router.use('/v1/polymarket/*', cacheControl());
router.route('/v1/polymarket/markets', polymarketMarkets);
router.route('/v1/polymarket/markets/ohlc', polymarketOhlcv);
router.route('/v1/polymarket/markets/oi', polymarketOi);
router.route('/v1/polymarket/markets/activity', polymarketActivity);
router.route('/v1/polymarket/markets/positions', polymarketMarketPositions);
router.route('/v1/polymarket/platform', polymarketPlatform);
router.route('/v1/polymarket/users', polymarketUsers);
router.route('/v1/polymarket/users/positions', polymarketPositions);

// Monitoring
router.route('/v1', health);
router.route('/v1', version);
router.route('/v1', networks);

export default router;
