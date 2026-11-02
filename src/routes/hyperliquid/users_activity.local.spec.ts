import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import query from './users_activity.sql' with { type: 'text' };

// Executes the real query against isolated local tables, without production credentials.
// CLICKHOUSE_LOCAL_BIN=clickhouse bun test src/routes/hyperliquid/users_activity.local.spec.ts
const clickhouse = process.env.CLICKHOUSE_LOCAL_BIN;

// Every event table shares the sink's template: sorted by (timestamp, block_num), with the
// materialized `minute` the funding projection groups by.
const event = (columns: string) => `(
    block_num UInt64, timestamp DateTime('UTC'), minute UInt32 MATERIALIZED toRelativeMinuteNum(timestamp),
    event_hash String, event_index UInt32, ${columns}`;
const fixture = `
CREATE DATABASE hc;
CREATE TABLE hc.c_deposits ${event('user String, amount Float64')}) ENGINE=MergeTree ORDER BY (timestamp, block_num);
CREATE TABLE hc.c_withdrawals ${event('user String, amount Float64, is_finalized Bool')}) ENGINE=MergeTree ORDER BY (timestamp, block_num);
CREATE TABLE hc.ledger_deposits ${event('users String, usdc_num Float64')}) ENGINE=MergeTree ORDER BY (timestamp, block_num);
CREATE TABLE hc.ledger_withdrawals ${event('users String, usdc_num Float64')}) ENGINE=MergeTree ORDER BY (timestamp, block_num);
CREATE TABLE hc.ledger_vault_deposits ${event('users String, vault String, usdc_num Float64')}) ENGINE=MergeTree ORDER BY (timestamp, block_num);
CREATE TABLE hc.ledger_vault_withdrawals ${event('user String, vault String, net_withdrawn_usd_num Float64, commission_num Float64, basis_num Float64')}) ENGINE=MergeTree ORDER BY (timestamp, block_num);
CREATE TABLE hc.ledger_liquidations ${event('users String, liquidated_ntl_pos_num Float64, leverage_type String, account_value_num Float64')}) ENGINE=MergeTree ORDER BY (timestamp, block_num);
CREATE TABLE hc.funding_deltas ${event(`user String, coin String, dex LowCardinality(String) DEFAULT 'perps',
    funding_amount Float64, szi Float64, funding_rate Float64,
    PROJECTION prj_dex_user_by_minute (SELECT dex, user, minute, count() GROUP BY dex, user, minute)`)}) ENGINE=MergeTree ORDER BY (timestamp, block_num);

-- u1 and a bot are paid funding on two coins every hour from 2026-01-01 00:00 to 2026-01-03 23:00.
-- Block 1000 + 10 * hour + coin; the ETH row (coin 1) of an hour sorts before its BTC row.
INSERT INTO hc.funding_deltas (block_num, timestamp, event_hash, event_index, user, coin, funding_amount, szi, funding_rate)
    SELECT 1000 + 10 * h + c, toDateTime('2026-01-01 00:00:00', 'UTC') + h * 3600, concat('f-', u, '-', toString(h), '-', toString(c)), c,
           u, if(c = 0, 'BTC', 'ETH'), 0.5, 2, 0.0001
    FROM (SELECT number AS h FROM numbers(72)) AS hours
    CROSS JOIN (SELECT number AS c FROM numbers(2)) AS coins
    CROSS JOIN (SELECT arrayJoin(['u1', 'bot']) AS u) AS users;
INSERT INTO hc.c_deposits VALUES (2000, '2026-01-04 00:30:00', 'bridge-in', 0, 'u1', 500);
INSERT INTO hc.c_withdrawals VALUES (1500, '2026-01-02 12:30:00', 'bridge-out', 0, 'u1', 100, true);
INSERT INTO hc.ledger_deposits VALUES (1700, '2026-01-03 06:30:00', 'ledger-in', 0, 'u1,u2', 42);
INSERT INTO hc.ledger_vault_deposits VALUES (1100, '2026-01-01 05:30:00', 'vault-in', 0, 'u1', 'v1', 20);
INSERT INTO hc.ledger_vault_withdrawals VALUES (1900, '2026-01-03 18:30:00', 'vault-out', 0, 'u1', 'v1', 10, 1, 9);
INSERT INTO hc.ledger_liquidations VALUES (1600, '2026-01-02 20:30:00', 'liq', 0, 'u1', 300, 'cross', 50);
-- One event inside the default 30-day window, for another user.
INSERT INTO hc.c_deposits VALUES (3000, now() - INTERVAL 1 HOUR, 'recent-in', 0, 'u3', 7);
`;

interface Event {
    block_num: number;
    transaction_hash: string;
    event_type: string;
    user: string;
    counterparty: string;
    amount: number;
    notes: string;
}

function run(params: Record<string, string> = {}): Event[] {
    const defaults = {
        db_hypercore: 'hc',
        user: 'u1',
        event_types: '[]',
        start_time: '1767225600', // 2026-01-01 00:00:00 UTC
        end_time: '\\N',
        limit: '10',
        offset: '0',
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

const hashes = (rows: Event[]) => rows.map((r) => r.transaction_hash);

describe.skipIf(!clickhouse)('Hyperliquid user activity on local tables', () => {
    it('merges every event table, newest first', () => {
        const rows = run({ limit: '4' });
        expect(hashes(rows)).toEqual(['bridge-in', 'f-u1-71-1', 'f-u1-71-0', 'f-u1-70-1']);
        expect(rows.map((r) => r.event_type)).toEqual(['bridge_deposit', 'funding', 'funding', 'funding']);
        expect(rows[0]).toMatchObject({ user: 'u1', amount: 500, counterparty: '' });
        expect(rows[1]).toMatchObject({ counterparty: 'ETH', notes: 'position_size=2,rate=0.0001' });
    });

    it('pages through the funding history without losing hours', () => {
        // Funding rows only, sorted newest first, two per hour: offset 10 lands on hour 18.
        expect(hashes(run({ event_types: "['funding']", limit: '4', offset: '10' }))).toEqual([
            'f-u1-66-1',
            'f-u1-66-0',
            'f-u1-65-1',
            'f-u1-65-0',
        ]);
        // A page that straddles funding and the other tables.
        expect(hashes(run({ limit: '3', offset: '12' }))).toEqual(['f-u1-66-1', 'f-u1-66-0', 'f-u1-65-1']);
    });

    it('keeps the rarer event types in order among the funding rows', () => {
        const rows = run({
            event_types: "['vault_withdraw', 'liquidation', 'bridge_withdraw_finalized', 'deposit', 'vault_deposit']",
        });
        expect(hashes(rows)).toEqual(['vault-out', 'ledger-in', 'liq', 'bridge-out', 'vault-in']);
        expect(rows.map((r) => [r.event_type, r.counterparty, r.amount, r.notes])).toEqual([
            ['vault_withdraw', 'v1', 10, 'commission=1,basis=9'],
            ['deposit', '', 42, ''],
            ['liquidation', '', -300, 'leverage=cross,account_value=50'],
            ['bridge_withdraw_finalized', '', -100, ''],
            ['vault_deposit', 'v1', -20, ''],
        ]);
    });

    it('bounds the window on both ends', () => {
        // 2026-01-02 00:00 <= timestamp < 2026-01-03 00:00: hours 24..47 and the liquidation at 20:30.
        const rows = run({ start_time: '1767312000', end_time: '1767398400' });
        expect(hashes(rows)).toEqual([
            'f-u1-47-1',
            'f-u1-47-0',
            'f-u1-46-1',
            'f-u1-46-0',
            'f-u1-45-1',
            'f-u1-45-0',
            'liq',
            'f-u1-44-1',
            'f-u1-44-0',
            'f-u1-43-1',
        ]);
        expect(hashes(run({ start_time: '1767312000', end_time: '1767398400', offset: '6', limit: '3' }))).toEqual([
            'liq',
            'f-u1-44-1',
            'f-u1-44-0',
        ]);
    });

    it('defaults to the last 30 days', () => {
        expect(hashes(run({ user: 'u3', start_time: '\\N' }))).toEqual(['recent-in']);
        expect(run({ start_time: '\\N' })).toEqual([]);
    });
});
