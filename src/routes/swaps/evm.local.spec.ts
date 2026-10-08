import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import query from './evm.sql' with { type: 'text' };

// Executes the real query against isolated local tables, without production credentials.
// CLICKHOUSE_LOCAL_BIN=clickhouse bun test src/routes/swaps/evm.local.spec.ts
const clickhouse = process.env.CLICKHOUSE_LOCAL_BIN;
const fixture = `
CREATE DATABASE dex;
CREATE DATABASE metadata;
CREATE TABLE dex.blocks (block_num UInt32, timestamp DateTime('UTC')) ENGINE=MergeTree ORDER BY block_num;
CREATE TABLE dex.swaps (
    block_num UInt32, timestamp DateTime('UTC'), minute UInt32,
    tx_index UInt32, tx_hash String, tx_from String, call_index UInt32, call_caller String,
    log_index UInt32, log_ordinal UInt32, log_block_index UInt32, log_topic0 String,
    protocol String, factory String, pool String, user String,
    input_contract String, input_amount UInt256, output_contract String, output_amount UInt256
) ENGINE=MergeTree ORDER BY (minute, timestamp, block_num);
CREATE TABLE metadata.metadata (network String, contract String, block_num UInt32, name String, symbol String, decimals UInt8)
    ENGINE=ReplacingMergeTree(block_num) ORDER BY (network, contract);
INSERT INTO dex.swaps
    SELECT 100 + n, ts, toRelativeMinuteNum(ts), 0, concat('tx-', toString(n)), 'sender', 0, 'caller', 0, n, n, 'topic',
           if(n % 4 = 0, 'uniswap_v3', 'uniswap_v2'), 'factory', if(n % 3 = 0, 'pool-x', 'pool-y'), 'user',
           if(n % 2 = 0, 'token-a', 'token-b'), 1000000, if(n % 2 = 0, 'token-c', 'token-a'), 2000000000000000000
    FROM (SELECT number AS n, toDateTime('2026-09-01 00:00:00', 'UTC') + number * 60 AS ts FROM numbers(12));
INSERT INTO metadata.metadata VALUES
    ('mainnet','token-a',1,'Token A','AAA',6),('mainnet','token-b',1,'Token B','BBB',18),('mainnet','token-c',1,'Token C','CCC',18),
    ('base','token-a',1,'Wrong network','XXX',0);
`;

interface Token {
    address: string;
    symbol: string;
    decimals: number;
}
interface Swap {
    transaction_id: string;
    protocol: string;
    input_token: Token;
    output_token: Token;
}

function run(params: Record<string, string> = {}): Swap[] {
    const defaults = {
        db_dex: 'dex',
        network: 'mainnet',
        transaction_id: '[]',
        factory: '[]',
        pool: '[]',
        user: '[]',
        recipient: '[]',
        sender: '[]',
        caller: '[]',
        transaction_from: '[]',
        input_contract: '[]',
        output_contract: '[]',
        protocol: '\\N',
        excluded_protocols: "['kyber_elastic']",
        start_time: '\\N',
        end_time: '\\N',
        start_block: '\\N',
        end_block: '\\N',
        limit: '10',
        offset: '0',
    };
    const result = spawnSync(
        clickhouse ?? 'clickhouse',
        ['local', '--multiquery', ...Object.entries({ ...defaults, ...params }).map(([k, v]) => `--param_${k}=${v}`)],
        { input: `${fixture}\n${query}\nFORMAT JSONEachRow;`, encoding: 'utf8', timeout: 15000 }
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}

const ids = (rows: Swap[]) => rows.map((r) => r.transaction_id);
const pair = (r: Swap) => [r.input_token.symbol, r.output_token.symbol];

describe.skipIf(!clickhouse)('EVM swaps on local tables', () => {
    it('returns the newest swaps for a token, enriched on both sides from the requested network', () => {
        const rows = run({ pool: "['pool-x']" });
        expect(ids(rows)).toEqual(['tx-9', 'tx-6', 'tx-3', 'tx-0']);
        expect(rows.map(pair)).toEqual([
            ['BBB', 'AAA'],
            ['AAA', 'CCC'],
            ['BBB', 'AAA'],
            ['CCC', 'AAA'],
        ]);
        expect(rows.find((r) => r.transaction_id === 'tx-6')?.input_token).toEqual({
            address: 'token-a',
            symbol: 'AAA',
            decimals: 6,
        });
    });

    it('keeps the uniswap_v3 orientation hotfix in the enriched tokens', () => {
        const rows = run({ protocol: 'uniswap_v3' });
        expect(ids(rows)).toEqual(['tx-8', 'tx-4', 'tx-0']);
        for (const row of rows) expect(pair(row)).toEqual(['CCC', 'AAA']);
    });

    it('paginates and intersects several filters', () => {
        expect(ids(run({ input_contract: "['token-b']", limit: '2', offset: '1' }))).toEqual(['tx-9', 'tx-7']);
        expect(ids(run({ input_contract: "['token-b']", pool: "['pool-x']" }))).toEqual(['tx-9', 'tx-3']);
    });
});
