import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import query from './evm.sql' with { type: 'text' };

// Executes the real query against isolated local tables, without production credentials.
// CLICKHOUSE_LOCAL_BIN=clickhouse bun test src/routes/transfers/evm.local.spec.ts
const clickhouse = process.env.CLICKHOUSE_LOCAL_BIN;
const fixture = `
CREATE DATABASE transfers;
CREATE DATABASE metadata;
CREATE TABLE transfers.blocks (block_num UInt32, timestamp DateTime('UTC')) ENGINE=MergeTree ORDER BY block_num;
CREATE TABLE transfers.transfers (
    block_num UInt32, timestamp DateTime('UTC'), minute UInt32, tx_hash String,
    log_index Nullable(UInt32), log_address LowCardinality(String), transfer_type String,
    \`from\` String, \`to\` String, amount UInt256
) ENGINE=MergeTree ORDER BY (minute, timestamp, block_num);
CREATE TABLE metadata.metadata (network String, contract String, block_num UInt32, name String, symbol String, decimals UInt8)
    ENGINE=ReplacingMergeTree(block_num) ORDER BY (network, contract);
INSERT INTO transfers.transfers
    SELECT 100 + n, ts, toRelativeMinuteNum(ts), concat('tx-', toString(n)), 0, if(n % 2 = 0, 'token-a', 'token-b'), 'transfer',
           if(n % 3 = 0, 'from-x', 'from-y'), 'to', 1000000000
    FROM (SELECT number AS n, toDateTime('2026-09-01 00:00:00', 'UTC') + number * 60 AS ts FROM numbers(12));
INSERT INTO metadata.metadata VALUES ('mainnet','token-a',1,'Token A','AAA',6),('mainnet','token-b',1,'Token B','BBB',9),
    ('base','token-a',1,'Wrong network','XXX',0);
`;

interface Transfer {
    transaction_id: string;
    contract: string;
    symbol: string | null;
    decimals: number;
    value: number;
}

function run(params: Record<string, string> = {}): Transfer[] {
    const defaults = {
        db_transfers: 'transfers',
        network: 'mainnet',
        transaction_id: '[]',
        from_address: '[]',
        to_address: '[]',
        contract: '[]',
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

const ids = (rows: Transfer[]) => rows.map((r) => r.transaction_id);

describe.skipIf(!clickhouse)('EVM transfers on local tables', () => {
    it('returns the newest transfers for a contract, enriched from the requested network', () => {
        const rows = run({ contract: "['token-a']", limit: '3' });
        expect(ids(rows)).toEqual(['tx-10', 'tx-8', 'tx-6']);
        for (const row of rows) expect([row.symbol, row.decimals, row.value]).toEqual(['AAA', 6, 1000]);
    });

    it('enriches every contract on the page when it spans several tokens', () => {
        const rows = run({ from_address: "['from-x']" });
        expect(ids(rows)).toEqual(['tx-9', 'tx-6', 'tx-3', 'tx-0']);
        expect(rows.map((r) => [r.symbol, r.decimals])).toEqual([
            ['BBB', 9],
            ['AAA', 6],
            ['BBB', 9],
            ['AAA', 6],
        ]);
    });

    it('paginates and intersects several filters', () => {
        expect(ids(run({ contract: "['token-a']", limit: '2', offset: '2' }))).toEqual(['tx-6', 'tx-4']);
        expect(ids(run({ contract: "['token-a']", from_address: "['from-x']" }))).toEqual(['tx-6', 'tx-0']);
    });
});
