import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import trades from './outcomes_trades.sql' with { type: 'text' };
import activity from './outcomes_users_activity.sql' with { type: 'text' };

// Executes the real queries against isolated local tables, without production credentials.
// CLICKHOUSE_LOCAL_BIN=clickhouse bun test src/routes/hyperliquid/outcomes_trades.local.spec.ts
const clickhouse = process.env.CLICKHOUSE_LOCAL_BIN;
const fixture = `
CREATE DATABASE hc;
CREATE TABLE hc.outcome_fills (
    block_num UInt64, timestamp DateTime('UTC'), minute UInt32 MATERIALIZED toRelativeMinuteNum(timestamp),
    event_hash String, event_index UInt32, transaction_id UInt64,
    user String, coin LowCardinality(String), outcome_id UInt64, side_index UInt8, side LowCardinality(String), direction LowCardinality(String),
    price Float64, size Float64, start_position String, closed_pnl_num Float64, fee Float64, fee_token LowCardinality(String),
    order_id UInt64, client_order_id String, twap_id UInt64, crossed Bool,
    PROJECTION prj_user_by_minute (SELECT user, minute, count() GROUP BY user, minute),
    PROJECTION prj_outcome_by_minute (SELECT outcome_id, minute, count() GROUP BY outcome_id, minute)
) ENGINE=MergeTree ORDER BY (timestamp, block_num);
CREATE TABLE hc.state_question_meta (
    question_id UInt64, name String, named_outcome_ids Array(UInt64), settled_outcome_ids Array(UInt64), fallback_outcome_id UInt64
) ENGINE=ReplacingMergeTree ORDER BY question_id;
CREATE TABLE hc.state_outcome_meta (
    outcome_id UInt64, name String, side_specs Array(String), status String, question_id Nullable(UInt64), settle_fraction Nullable(Float64)
) ENGINE=ReplacingMergeTree ORDER BY outcome_id;
INSERT INTO hc.state_question_meta VALUES (1, 'Who wins?', [10, 11], [], 12), (2, 'Rain tomorrow?', [20], [], 21);
INSERT INTO hc.state_outcome_meta VALUES
    (10, 'Alice', ['Yes', 'No'], 'live', 1, NULL), (11, 'Bob', ['Yes', 'No'], 'live', 1, NULL), (20, 'Rain', ['Yes', 'No'], 'settled', 2, 1);

-- A bot trades outcome 20 every minute for two days from 2026-01-01, and reshapes it once an hour.
INSERT INTO hc.outcome_fills
    SELECT 100000 + n, toDateTime('2026-01-01 00:00:00', 'UTC') + n * 60, concat('bot-', toString(n)), 0, n,
           'bot', '#200', 20, 0, 'BID', if(n % 2 = 0, 'BUY', 'SELL'), 0.5, 10, '0', 0, 0.01, 'USDC', n, '', 0, false
    FROM (SELECT number AS n FROM numbers(2880));
INSERT INTO hc.outcome_fills
    SELECT 100000 + n, toDateTime('2026-01-01 00:00:00', 'UTC') + n * 60, concat('bot-neg-', toString(n)), 1, n,
           'bot', '#201', 20, 1, 'ASK', 'NEGATE_OUTCOME', 0, 10, '10', 0, 0, 'USDC', n, '', 0, false
    FROM (SELECT number * 60 AS n FROM numbers(48));
-- u1 buys Alice four times on the first day, sells Bob twice on the second, and has two reshapes.
INSERT INTO hc.outcome_fills
    SELECT 100000 + n, toDateTime('2026-01-01 00:00:00', 'UTC') + n * 60, concat('u1-', toString(k)), 7, n,
           'u1', if(k <= 4, '#100', '#111'), if(k <= 4, 10, 11), if(k <= 4, 0, 1), 'BID', if(k <= 4, 'BUY', 'SELL'), 0.6, 5, '0', 0, 0.02, 'USDC', k, '', 0, true
    FROM (SELECT arrayJoin([1, 2, 3, 4, 5, 6]) AS k, [180, 240, 300, 360, 2040, 2100][k] AS n);
INSERT INTO hc.outcome_fills VALUES
    (100000 + 1800, '2026-01-02 06:00:00', 'u1-settle', 7, 1800, 'u1', '#100', 10, 0, 'BID', 'SETTLEMENT', 1, 5, '5', 2, 0, 'USDC', 0, '', 0, false),
    (100000 + 420, '2026-01-01 07:00:00', 'u1-merge', 7, 420, 'u1', '#111', 11, 1, 'ASK', 'MERGE_OUTCOME', 0, 5, '5', -1, 0, 'USDC', 0, '', 0, false);
`;

interface Row {
    transaction_hash: string;
    user: string;
    direction: string;
    outcome: {
        outcome_id: number;
        outcome_name: string;
        question_id: number;
        question_name: string;
        side_label: string;
    };
}

function run(sql: string, params: Record<string, string> = {}): Row[] {
    const defaults = {
        db_hypercore: 'hc',
        user: '[]',
        coin: '[]',
        outcome_id: '[]',
        question_id: '[]',
        direction: '[]',
        start_time: '1767225600', // 2026-01-01 00:00:00 UTC
        end_time: '\\N',
        limit: '10',
        offset: '0',
    };
    const result = spawnSync(
        clickhouse ?? 'clickhouse',
        ['local', '--multiquery', ...Object.entries({ ...defaults, ...params }).map(([k, v]) => `--param_${k}=${v}`)],
        { input: `${fixture}\n${sql}\nFORMAT JSONEachRow;`, encoding: 'utf8', timeout: 60000 }
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}

const hashes = (rows: Row[]) => rows.map((r) => r.transaction_hash);
const compositions = "['SETTLEMENT', 'SPLIT_OUTCOME', 'MERGE_OUTCOME', 'MERGE_QUESTION', 'NEGATE_OUTCOME']";

describe.skipIf(!clickhouse)('Hyperliquid outcome trades and activity on local tables', () => {
    it('finds a rare user behind two days of other trades', () => {
        const rows = run(trades, { user: "['u1']" });
        expect(hashes(rows)).toEqual(['u1-6', 'u1-5', 'u1-settle', 'u1-merge', 'u1-4', 'u1-3', 'u1-2', 'u1-1']);
        expect(rows[0]?.outcome).toMatchObject({
            outcome_id: 11,
            outcome_name: 'Bob',
            question_id: 1,
            question_name: 'Who wins?',
            side_label: 'No',
        });
        expect(hashes(run(trades, { user: "['u1']", limit: '2', offset: '5' }))).toEqual(['u1-3', 'u1-2']);
    });

    it('combines the user with an outcome whose trades are older than the user newest minutes', () => {
        expect(hashes(run(trades, { user: "['u1']", outcome_id: "['10']", limit: '2' }))).toEqual([
            'u1-settle',
            'u1-4',
        ]);
        expect(hashes(run(trades, { user: "['u1']", outcome_id: "['10']", direction: "['BUY']", limit: '2' }))).toEqual(
            ['u1-4', 'u1-3']
        );
    });

    it('filters by question and by outcome, newest first', () => {
        expect(hashes(run(trades, { question_id: "['1']", limit: '3' }))).toEqual(['u1-6', 'u1-5', 'u1-settle']);
        expect(hashes(run(trades, { outcome_id: "['20']", limit: '2' }))).toEqual(['bot-2879', 'bot-2878']);
        expect(hashes(run(trades, { outcome_id: "['20']", direction: "['BUY']", limit: '2', offset: '1' }))).toEqual([
            'bot-2876',
            'bot-2874',
        ]);
        expect(hashes(run(trades, { user: "['u1']", end_time: '1767236401' }))).toEqual(['u1-1']);
    });

    it('serves the composition feed with the same filters', () => {
        expect(hashes(run(activity, { user: "['u1']", direction: compositions }))).toEqual(['u1-settle', 'u1-merge']);
        expect(hashes(run(activity, { question_id: "['1']", direction: compositions }))).toEqual([
            'u1-settle',
            'u1-merge',
        ]);
        expect(hashes(run(activity, { user: "['u1']", outcome_id: "['11']", direction: compositions }))).toEqual([
            'u1-merge',
        ]);
        expect(hashes(run(activity, { question_id: "['2']", direction: compositions, limit: '2' }))).toEqual([
            'bot-neg-2820',
            'bot-neg-2760',
        ]);
        expect(run(activity, { user: "['u1']", direction: "['SPLIT_OUTCOME']" })).toEqual([]);
    });
});
