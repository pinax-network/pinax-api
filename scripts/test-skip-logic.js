const m = await import('./src/supported-routes.js');
const cfg = (await import('./src/config.js')).config;

console.log('=== Testing SVM dexes ===');
let route = { chain: 'svm', requires: ['dex'] };
let network = 'solana';
let hasAllDbs = route.requires.every((cat) => m.hasDatabase(cfg, network, cat));
console.log(`Network: ${network}, requires: ${route.requires}, hasAllDbs: ${hasAllDbs}`);

console.log('\n=== Testing EVM NFT collections ===');
route = { chain: 'evm', requires: ['contracts', 'nft'] };
network = 'mainnet';
hasAllDbs = route.requires.every((cat) => m.hasDatabase(cfg, network, cat));
console.log(`Network: ${network}, requires: ${route.requires}, hasAllDbs: ${hasAllDbs}`);
for (const cat of route.requires) {
    const has = m.hasDatabase(cfg, network, cat);
    console.log(`  hasDatabase('${network}', '${cat}'): ${has}`);
}

console.log('\n=== Testing EVM NFT holders ===');
route = { chain: 'evm', requires: ['nft'] };
network = 'mainnet';
hasAllDbs = route.requires.every((cat) => m.hasDatabase(cfg, network, cat));
console.log(`Network: ${network}, requires: ${route.requires}, hasAllDbs: ${hasAllDbs}`);
for (const cat of route.requires) {
    const has = m.hasDatabase(cfg, network, cat);
    console.log(`  hasDatabase('${network}', '${cat}'): ${has}`);
}

console.log('\n=== Available databases ===');
console.log('Networks:', Object.keys(cfg.networks));
console.log('dexDatabases:', cfg.dexDatabases);
console.log('nftDatabases:', cfg.nftDatabases);
console.log('contractsDatabases:', cfg.contractsDatabases);
