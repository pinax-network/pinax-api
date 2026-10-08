import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import query from './svm.sql' with { type: 'text' };

// Executes the real query against isolated local tables, without production credentials.
// CLICKHOUSE_LOCAL_BIN=clickhouse bun test src/routes/swaps/svm.local.spec.ts
const clickhouse = process.env.CLICKHOUSE_LOCAL_BIN;
const fixture = `
CREATE DATABASE dex;
CREATE DATABASE meta;
CREATE DATABASE accounts;
CREATE FUNCTION program_names AS x -> toString(x);
CREATE TABLE dex.blocks (block_num UInt32, timestamp DateTime('UTC')) ENGINE=MergeTree ORDER BY block_num;
CREATE TABLE dex.swaps (
    block_num UInt32, timestamp DateTime('UTC'), minute UInt32 MATERIALIZED toRelativeMinuteNum(timestamp),
    transaction_index UInt32, instruction_index UInt32, stack_height UInt32,
    signature String, fee_payer String, signer String, signers Array(String),
    fee UInt64, compute_units_consumed UInt64, program_id String, protocol String,
    amm String, amm_pool String, user String,
    input_mint String, input_amount UInt64, output_mint String, output_amount UInt64
) ENGINE=MergeTree ORDER BY (timestamp, block_num, transaction_index, instruction_index);
CREATE TABLE meta.metadata (mint String, name String, symbol String, uri String, timestamp DateTime) ENGINE=MergeTree ORDER BY mint;
CREATE TABLE accounts.decimals_state (mint String, decimals UInt8) ENGINE=MergeTree ORDER BY mint;
INSERT INTO dex.swaps
    SELECT 100 + n, toDateTime('2026-09-01 00:00:00', 'UTC') + n * 60, 0, 0, 1,
           concat('sig-', toString(n)), 'payer', 'payer', ['payer'], 5000, 1000, 'program', 'jupiter_v6',
           'amm', if(n % 3 = 0, 'pool-x', 'pool-y'), 'user',
           if(n % 2 = 0, 'mint-a', 'mint-b'), 1000000, if(n % 2 = 0, 'mint-c', 'mint-a'), 2000000000
    FROM (SELECT number AS n FROM numbers(12));
INSERT INTO meta.metadata VALUES ('mint-a','Token A','AAA','',now()),('mint-b','Token B','BBB','',now()),('mint-c','Token C','CCC','',now());
INSERT INTO accounts.decimals_state VALUES ('mint-a',6),('mint-b',9),('mint-c',9);
`;

interface Swap {
    signature: string;
    input_mint: string;
    output_mint: string;
    amm_pool: string;
    input_token: { address: string; symbol: string | null; decimals: number | null };
    output_token: { address: string; symbol: string | null; decimals: number | null };
    input_value: number;
    output_value: number;
}

function run(params: Record<string, string> = {}): Swap[] {
    const defaults = {
        db_dex: 'dex',
        db_metadata: 'meta',
        db_accounts: 'accounts',
        network: 'solana',
        signature: '[]',
        amm: '[]',
        amm_pool: '[]',
        user: '[]',
        fee_payer: '[]',
        signer: '[]',
        input_mint: '[]',
        output_mint: '[]',
        program_id: '[]',
        protocol: '\\N',
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

const signatures = (rows: Swap[]) => rows.map((r) => r.signature);

describe.skipIf(!clickhouse)('SVM swaps on local tables', () => {
    it('returns the newest swaps for a mint, enriched on both sides', () => {
        const rows = run({ input_mint: "['mint-a']", limit: '3' });
        expect(signatures(rows)).toEqual(['sig-10', 'sig-8', 'sig-6']);
        for (const row of rows) {
            expect(row.input_token).toEqual({ address: 'mint-a', symbol: 'AAA', decimals: 6 });
            expect(row.output_token).toEqual({ address: 'mint-c', symbol: 'CCC', decimals: 9 });
            expect([row.input_value, row.output_value]).toEqual([1, 2]);
        }
    });

    it('enriches every mint on the page when it spans several tokens', () => {
        const rows = run({ amm_pool: "['pool-x']" });
        expect(signatures(rows)).toEqual(['sig-9', 'sig-6', 'sig-3', 'sig-0']);
        expect(rows.map((r) => [r.input_token.symbol, r.output_token.symbol])).toEqual([
            ['BBB', 'AAA'],
            ['AAA', 'CCC'],
            ['BBB', 'AAA'],
            ['AAA', 'CCC'],
        ]);
    });

    it('paginates and intersects several filters', () => {
        expect(signatures(run({ input_mint: "['mint-a']", limit: '2', offset: '2' }))).toEqual(['sig-6', 'sig-4']);
        expect(signatures(run({ input_mint: "['mint-a']", amm_pool: "['pool-x']" }))).toEqual(['sig-6', 'sig-0']);
    });
});
