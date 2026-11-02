import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import query from './markets_activity.sql' with { type: 'text' };

// Executes the real query against isolated local tables, without production credentials.
// CLICKHOUSE_LOCAL_BIN=clickhouse bun test src/routes/hyperliquid/markets_activity.local.spec.ts
const clickhouse = process.env.CLICKHOUSE_LOCAL_BIN;
const fixture = `
CREATE DATABASE hc;
CREATE TABLE hc.fills (
    block_num UInt64, timestamp DateTime('UTC'), minute UInt32 MATERIALIZED toRelativeMinuteNum(timestamp),
    event_hash String, event_index UInt32, transaction_id UInt64,
    user String, coin LowCardinality(String), dex LowCardinality(String), side LowCardinality(String), direction LowCardinality(String),
    price Float64, size Float64, start_position String, closed_pnl_num Float64, fee Float64, fee_token LowCardinality(String),
    order_id UInt64, client_order_id String, twap_id UInt64, crossed Bool,
    PROJECTION prj_user_by_minute (SELECT user, minute, count() GROUP BY user, minute)
) ENGINE=MergeTree ORDER BY (timestamp, block_num);
CREATE TABLE hc.state_spot_pair_names (coin String, market_name String) ENGINE=ReplacingMergeTree ORDER BY coin;
INSERT INTO hc.state_spot_pair_names VALUES ('BTC', 'Bitcoin');

-- A bot fills every 10 seconds for two days from 2026-01-01, alternating BTC and ETH: block 100000 + n.
INSERT INTO hc.fills
    SELECT 100000 + n, toDateTime('2026-01-01 00:00:00', 'UTC') + n * 10, concat('bot-', toString(n)), 0, n,
           'bot', if(n % 2 = 0, 'BTC', 'ETH'), 'perps', 'BID', 'Open Long', 100, 1, '0', 0, 0.1, 'USDC', n, '', 0, false
    FROM (SELECT number AS n FROM numbers(17280));
-- u1 fills six times: three BTC fills on the first day, then three ETH fills on the second.
INSERT INTO hc.fills
    SELECT 100000 + n, toDateTime('2026-01-01 00:00:00', 'UTC') + n * 10, concat('u1-', toString(k)), 7, n,
           'u1', if(k <= 3, 'BTC', 'ETH'), 'perps', 'ASK', 'Close Long', 100, 2, '2', 1.5, 0.2, 'USDC', k, 'c', 0, true
    FROM (SELECT arrayJoin([1, 2, 3, 4, 5, 6]) AS k, [1080, 1140, 1200, 12240, 12300, 12360][k] AS n);
`;

interface Fill {
    transaction_hash: string;
    user: string;
    coin: string;
    market_name: string;
    notional: number;
    closed_pnl: number;
}

function run(params: Record<string, string> = {}): Fill[] {
    const defaults = {
        db_hypercore: 'hc',
        user: '[]',
        coin: '[]',
        dex: '[]',
        direction: '[]',
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

const hashes = (rows: Fill[]) => rows.map((r) => r.transaction_hash);

describe.skipIf(!clickhouse)('Hyperliquid market activity on local tables', () => {
    it('finds a rare user behind two days of other fills', () => {
        const rows = run({ user: "['u1']" });
        expect(hashes(rows)).toEqual(['u1-6', 'u1-5', 'u1-4', 'u1-3', 'u1-2', 'u1-1']);
        expect(rows[0]).toMatchObject({ user: 'u1', coin: 'ETH', market_name: 'ETH', notional: 200, closed_pnl: 1.5 });
        expect(rows[5]).toMatchObject({ coin: 'BTC', market_name: 'Bitcoin' });
        expect(hashes(run({ user: "['u1']", limit: '2' }))).toEqual(['u1-6', 'u1-5']);
        expect(hashes(run({ user: "['u1']", limit: '2', offset: '4' }))).toEqual(['u1-2', 'u1-1']);
    });

    it('combines the user with a coin whose fills are older than the user newest minutes', () => {
        expect(hashes(run({ user: "['u1']", coin: "['BTC']", limit: '2' }))).toEqual(['u1-3', 'u1-2']);
        expect(hashes(run({ user: "['u1']", coin: "['BTC']", direction: "['Close Long']" }))).toEqual([
            'u1-3',
            'u1-2',
            'u1-1',
        ]);
        expect(run({ user: "['u1']", coin: "['BTC']", direction: "['Open Long']" })).toEqual([]);
    });

    it('bounds the user window on both ends', () => {
        // 2026-01-01 03:00 <= timestamp < 2026-01-02 00:00 keeps the BTC fills only.
        expect(hashes(run({ user: "['u1']", start_time: '1767236400', end_time: '1767312000' }))).toEqual([
            'u1-3',
            'u1-2',
            'u1-1',
        ]);
        expect(hashes(run({ user: "['u1']", start_time: '1767236401' }))).toEqual([
            'u1-6',
            'u1-5',
            'u1-4',
            'u1-3',
            'u1-2',
        ]);
    });

    it('pages the newest fills of a coin', () => {
        expect(hashes(run({ coin: "['BTC']", limit: '3' }))).toEqual(['bot-17278', 'bot-17276', 'bot-17274']);
        expect(hashes(run({ coin: "['ETH']", limit: '2', offset: '1' }))).toEqual(['bot-17277', 'bot-17275']);
        // Same block as a bot fill: the higher event_index sorts first.
        expect(hashes(run({ coin: "['BTC']", limit: '2', end_time: '1767237601' }))).toEqual(['u1-3', 'bot-1200']);
    });
});
