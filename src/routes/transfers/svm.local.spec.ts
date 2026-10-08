import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import query from './svm.sql' with { type: 'text' };

// Executes the real query against isolated local tables, without production credentials.
// CLICKHOUSE_LOCAL_BIN=clickhouse bun test src/routes/transfers/svm.local.spec.ts
const clickhouse = process.env.CLICKHOUSE_LOCAL_BIN;
const fixture = `
CREATE DATABASE transfers;
CREATE DATABASE meta;
CREATE DATABASE accounts;
CREATE TABLE transfers.blocks (block_num UInt32, timestamp DateTime('UTC')) ENGINE=MergeTree ORDER BY block_num;
CREATE TABLE transfers.transfers (
    block_num UInt32, timestamp DateTime('UTC'), minute UInt32 MATERIALIZED toRelativeMinuteNum(timestamp),
    transaction_index UInt32, instruction_index UInt32, stack_height UInt32,
    signature String, fee_payer String, signer String, signers Array(String),
    fee UInt64, compute_units_consumed UInt64, program_id String,
    authority String, multisig_authority Array(String), source String, destination String,
    amount UInt64, mint String, decimals Nullable(UInt8)
) ENGINE=MergeTree ORDER BY (timestamp, block_num, transaction_index, instruction_index);
CREATE TABLE meta.metadata (mint String, name String, symbol String, uri String, timestamp DateTime) ENGINE=MergeTree ORDER BY mint;
CREATE TABLE accounts.decimals_state (mint String, decimals UInt8) ENGINE=MergeTree ORDER BY mint;
INSERT INTO transfers.transfers
    SELECT 100 + n, toDateTime('2026-09-01 00:00:00', 'UTC') + n * 60, 0, 0, 1,
           concat('sig-', toString(n)), 'payer', 'payer', ['payer'], 5000, 1000, 'program',
           'authority', [], if(n % 3 = 0, 'source-x', 'source-y'), 'destination',
           1000000000, if(n % 2 = 0, 'mint-a', 'mint-b'), NULL
    FROM (SELECT number AS n FROM numbers(12));
INSERT INTO meta.metadata VALUES ('mint-a','Token A','AAA','',now()),('mint-b','Token B','BBB','',now());
INSERT INTO accounts.decimals_state VALUES ('mint-a',6),('mint-b',9);
`;

interface Transfer {
    signature: string;
    mint: string;
    symbol: string | null;
    decimals: number | null;
    value: number;
}

function run(params: Record<string, string> = {}): Transfer[] {
    const defaults = {
        db_transfers: 'transfers',
        db_metadata: 'meta',
        db_accounts: 'accounts',
        network: 'solana',
        signature: '[]',
        source: '[]',
        destination: '[]',
        mint: '[]',
        authority: '[]',
        program_id: '[]',
        fee_payer: '[]',
        signer: '[]',
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

const signatures = (rows: Transfer[]) => rows.map((r) => r.signature);

describe.skipIf(!clickhouse)('SVM transfers on local tables', () => {
    it('returns the newest transfers for a mint, enriched from metadata and decimals', () => {
        const rows = run({ mint: "['mint-a']", limit: '3' });
        expect(signatures(rows)).toEqual(['sig-10', 'sig-8', 'sig-6']);
        for (const row of rows) expect([row.symbol, row.decimals, row.value]).toEqual(['AAA', 6, 1000]);
    });

    it('enriches every mint on the page when it spans several tokens', () => {
        const rows = run({ source: "['source-x']" });
        expect(signatures(rows)).toEqual(['sig-9', 'sig-6', 'sig-3', 'sig-0']);
        expect(rows.map((r) => [r.symbol, r.decimals])).toEqual([
            ['BBB', 9],
            ['AAA', 6],
            ['BBB', 9],
            ['AAA', 6],
        ]);
    });

    it('paginates and intersects several filters', () => {
        expect(signatures(run({ mint: "['mint-a']", limit: '2', offset: '2' }))).toEqual(['sig-6', 'sig-4']);
        expect(signatures(run({ mint: "['mint-a']", source: "['source-x']" }))).toEqual(['sig-6', 'sig-0']);
    });
});
