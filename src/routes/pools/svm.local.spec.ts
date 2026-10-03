import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import query from './svm.sql' with { type: 'text' };

// Executes the real query against isolated local tables, without production credentials.
// CLICKHOUSE_LOCAL_BIN=clickhouse bun test src/routes/pools/svm.local.spec.ts
const clickhouse = process.env.CLICKHOUSE_LOCAL_BIN;
const fixture = `
CREATE DATABASE dex;
CREATE DATABASE accounts;
CREATE FUNCTION program_names AS x -> x;
CREATE TABLE dex.state_pools_aggregating_by_pool (
    amm_pool String, protocol String, program_id String, amm String,
    transactions SimpleAggregateFunction(sum, UInt64)
) ENGINE=AggregatingMergeTree ORDER BY (amm_pool, protocol, program_id, amm);
CREATE TABLE dex.state_pools_aggregating_by_mint (
    mint String, amm_pool String, protocol String, program_id String, amm String,
    transactions SimpleAggregateFunction(sum, UInt64)
) ENGINE=AggregatingMergeTree ORDER BY (mint, protocol, program_id, amm, amm_pool);
CREATE TABLE accounts.decimals_state (mint String, decimals UInt8)
    ENGINE=MergeTree ORDER BY mint;
SYSTEM STOP MERGES dex.state_pools_aggregating_by_pool;
SYSTEM STOP MERGES dex.state_pools_aggregating_by_mint;
INSERT INTO dex.state_pools_aggregating_by_pool VALUES
    ('pool-a','raydium_clmm','program-a','amm-a',2),
    ('pool-b','raydium_clmm','program-a','amm-a',8),
    ('pool-a','orca_whirlpool','program-b','amm-b',8),
    ('','raydium_clmm','program-a','amm-a',1000);
INSERT INTO dex.state_pools_aggregating_by_pool VALUES
    ('pool-a','raydium_clmm','program-a','amm-a',6),
    ('pool-b','raydium_clmm','program-a','amm-a',1),
    ('pool-a','orca_whirlpool','program-b','amm-b',1);
INSERT INTO dex.state_pools_aggregating_by_mint
    SELECT m, amm_pool, protocol, program_id, amm, transactions
    FROM dex.state_pools_aggregating_by_pool ARRAY JOIN ['mint-a','mint-b'] AS m;
INSERT INTO accounts.decimals_state VALUES ('mint-a',6),('mint-b',9);
`;

interface Pool {
    amm_pool: string;
    protocol: string;
    transactions: string;
    input_mint: string;
    output_mint: string;
    input_decimals: number;
    output_decimals: number;
}

function run(params: Record<string, string> = {}): Pool[] {
    const defaults = {
        db_dex: 'dex',
        db_accounts: 'accounts',
        network: 'solana',
        mint: '[]',
        amm: '[]',
        amm_pool: '[]',
        protocol: '\\N',
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

const ranked = [
    ['pool-a', 'orca_whirlpool', '9'],
    ['pool-b', 'raydium_clmm', '9'],
    ['pool-a', 'raydium_clmm', '8'],
];
const keys = (rows: Pool[]) => rows.map((r) => [r.amm_pool, r.protocol, r.transactions]);

describe.skipIf(!clickhouse)('SVM pool aggregation with unmerged parts', () => {
    it('sums all parts, separates full pool identities, orders ties, and enriches tokens', () => {
        const rows = run();
        expect(keys(rows)).toEqual(ranked);
        for (const row of rows) {
            expect([row.input_mint, row.output_mint, row.input_decimals, row.output_decimals]).toEqual([
                'mint-a',
                'mint-b',
                6,
                9,
            ]);
        }
    });

    it('paginates after summing and ordering', () => {
        expect(keys(run({ limit: '1', offset: '1' }))).toEqual(ranked.slice(1, 2));
    });

    it('retains complete totals for pool, protocol, and AMM filters', () => {
        expect(keys(run({ amm_pool: "['pool-a']" }))).toEqual(ranked.filter(([pool]) => pool === 'pool-a'));
        expect(keys(run({ protocol: 'raydium_clmm' }))).toEqual(ranked.slice(1));
        expect(keys(run({ amm: "['amm-b']" }))).toEqual(ranked.slice(0, 1));
    });

    it('keeps mint ranking complete without double counting multiple requested mints', () => {
        expect(keys(run({ mint: "['mint-a']" }))).toEqual(ranked);
        expect(keys(run({ mint: "['mint-a','mint-b']" }))).toEqual(ranked);
    });
});
