import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import query from './svm.sql' with { type: 'text' };

// Executes the real query against isolated local tables, without production credentials.
// CLICKHOUSE_LOCAL_BIN=clickhouse bun test src/routes/holders/svm.local.spec.ts
const clickhouse = process.env.CLICKHOUSE_LOCAL_BIN;

/** Holder i of mint M1 holds 2,000,000 - i base units, so a lower i is a larger holder. */
const acct = (i: number) => `acct${String(i).padStart(4, '0')}`;
/** M1 holders from..to in rank order. */
const m1 = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => acct(from + k));
/** M3 holders from..to, all with the same amount. */
const m3 = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, k) => `m3acct${String(from + k).padStart(3, '0')}`);

// The holders view is a plain table here with the view's reverse key. It holds open accounts only:
// the sink writes a zero balance when an account is closed (svm-balances v0.3.5), and the view is
// built from `balances FINAL WHERE amount > 0`. owner_state gets several versions per account, as
// the ReplacingMergeTree keeps them between merges.
const fixture = `
CREATE DATABASE balances;
CREATE DATABASE accounts;
CREATE DATABASE metadata;
CREATE TABLE balances.balances_holders (
    block_num UInt32, timestamp DateTime('UTC'), program_id LowCardinality(String), mint LowCardinality(String),
    account String, amount UInt64, decimals UInt8
) ENGINE = MergeTree ORDER BY (program_id, mint, amount DESC, account) SETTINGS allow_experimental_reverse_key = 1;
CREATE TABLE accounts.owner_state (
    account String, program_id LowCardinality(String), version UInt64, is_deleted UInt8, block_num UInt32, timestamp DateTime('UTC'), owner String
) ENGINE = ReplacingMergeTree(version, is_deleted) ORDER BY account;
CREATE VIEW accounts.owner_view AS
    SELECT account, any(program_id) AS program_id, max(version) AS version, max(block_num) AS block_num, max(timestamp) AS timestamp,
           argMax(a.owner, a.version) AS owner
    FROM accounts.owner_state AS a GROUP BY account;
CREATE TABLE metadata.metadata (mint String, name String, symbol String, uri String, timestamp DateTime('UTC'))
    ENGINE = MergeTree ORDER BY mint;

-- M1: 1,500 holders, descending amounts. M2: 50 holders, no metadata. M3: 300 holders of one amount.
INSERT INTO balances.balances_holders
    SELECT 1000 + n, toDateTime('2026-01-01 00:00:00', 'UTC') + n, 'Tokenkeg', 'M1', concat('acct', leftPad(toString(n), 4, '0')), 2000000 - n, 6
    FROM (SELECT number + 1 AS n FROM numbers(1500));
INSERT INTO balances.balances_holders
    SELECT 3000 + n, toDateTime('2026-01-02 00:00:00', 'UTC') + n, 'Tokenkeg', 'M2', concat('m2acct', leftPad(toString(n), 2, '0')), 500000 - n * 10, 9
    FROM (SELECT number + 1 AS n FROM numbers(50));
INSERT INTO balances.balances_holders
    SELECT 5000 + n, toDateTime('2026-01-03 00:00:00', 'UTC') + n, 'Tokenkeg', 'M3', concat('m3acct', leftPad(toString(n), 3, '0')), 1000, 0
    FROM (SELECT number + 1 AS n FROM numbers(300));
-- Owners: 'owner-<i>'; acct0008 changed owner once, and the newest version wins.
INSERT INTO accounts.owner_state
    SELECT concat('acct', leftPad(toString(n), 4, '0')), 'Tokenkeg', 1, 0, 1, toDateTime('2025-12-01 00:00:00', 'UTC'), concat('owner-', toString(n))
    FROM (SELECT number + 1 AS n FROM numbers(1500));
INSERT INTO accounts.owner_state VALUES ('acct0008', 'Tokenkeg', 2, 0, 7000, '2026-04-01 00:00:00', 'owner-8-new');
INSERT INTO accounts.owner_state
    SELECT concat('m2acct', leftPad(toString(n), 2, '0')), 'Tokenkeg', 1, 0, 1, toDateTime('2025-12-01 00:00:00', 'UTC'), concat('m2owner-', toString(n))
    FROM (SELECT number + 1 AS n FROM numbers(50));
INSERT INTO metadata.metadata VALUES ('M1', 'Token One', 'ONE', 'https://one.example', '2026-01-01 00:00:00');
`;

interface Holder {
    token_account: string;
    owner: string;
    amount: string;
    value: number;
    decimals: number;
    mint: string;
    name: string | null;
    symbol: string | null;
    last_update_block_num: number;
    network: string;
}

function run(params: Record<string, string> = {}): Holder[] {
    const defaults = {
        db_balances: 'balances',
        db_accounts: 'accounts',
        db_metadata: 'metadata',
        mint: 'M1',
        limit: '10',
        offset: '0',
        network: 'solana',
    };
    const result = spawnSync(
        clickhouse ?? 'clickhouse',
        ['local', '--multiquery', ...Object.entries({ ...defaults, ...params }).map(([k, v]) => `--param_${k}=${v}`)],
        { input: `${fixture}\n${query}\nFORMAT JSONEachRow;`, encoding: 'utf8', timeout: 60000 }
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}

const accounts = (rows: Holder[]) => rows.map((r) => r.token_account);

describe.skipIf(!clickhouse)('Solana token holders on local tables', () => {
    it('returns the largest holders of the view with their owner and metadata', () => {
        const rows = run();
        expect(accounts(rows)).toEqual(m1(1, 10));
        expect(rows[0]).toMatchObject({
            token_account: 'acct0001',
            owner: 'owner-1',
            amount: '1999999',
            value: 1.999999,
            decimals: 6,
            mint: 'M1',
            name: 'Token One',
            symbol: 'ONE',
            last_update_block_num: 1001,
            network: 'solana',
        });
        expect(rows[7]).toMatchObject({ token_account: 'acct0008', owner: 'owner-8-new' }); // newest owner version wins
    });

    it('pages with an offset', () => {
        expect(accounts(run({ limit: '3', offset: '5' }))).toEqual(m1(6, 8));
        expect(accounts(run({ limit: '4', offset: '11' }))).toEqual(m1(12, 15));
        expect(accounts(run({ limit: '100', offset: '1450' }))).toEqual(m1(1451, 1500)); // the view ends
    });

    it('fills a page of 100', () => {
        const rows = run({ limit: '100' });
        expect(rows).toHaveLength(100);
        expect(accounts(rows)).toEqual(m1(1, 100));
    });

    it('pages holders of equal amounts in account order', () => {
        expect(accounts(run({ mint: 'M3', limit: '10' }))).toEqual(m3(1, 10));
        expect(accounts(run({ mint: 'M3', limit: '10', offset: '10' }))).toEqual(m3(11, 20));
        expect(accounts(run({ mint: 'M3', limit: '5', offset: '150' }))).toEqual(m3(151, 155));
    });

    it('serves a mint without metadata', () => {
        const rows = run({ mint: 'M2', limit: '5' });
        expect(accounts(rows)).toEqual(['m2acct01', 'm2acct02', 'm2acct03', 'm2acct04', 'm2acct05']);
        expect(rows[0]).toMatchObject({
            owner: 'm2owner-1',
            amount: '499990',
            value: 0.00049999,
            decimals: 9,
            name: null,
            symbol: null,
        });
    });

    it('returns nothing for a mint the view does not hold', () => {
        expect(run({ mint: 'M9' })).toEqual([]);
    });
});
