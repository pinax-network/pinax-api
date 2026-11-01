import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import query from './evm_native.sql' with { type: 'text' };
import queryAll from './evm_native_all.sql' with { type: 'text' };

// Executes the real queries against isolated local tables, without production credentials.
// CLICKHOUSE_LOCAL_BIN=clickhouse bun test src/routes/holders/evm_native.local.spec.ts
// The queries' SETTINGS need a recent ClickHouse, such as 26.8, the production version.
const clickhouse = process.env.CLICKHOUSE_LOCAL_BIN;

const TOKEN = 10n ** 18n;
const wei = (tokens: number) => (BigInt(tokens) * TOKEN).toString();
/** Current holder i holds 100 - i tokens. */
const h = (i: number) => `0xa${String(i).padStart(39, '0')}`;
/** Former holder n held 1,000 + n tokens and now holds 1 token when n is odd, 0 when even. */
const f = (n: number) => `0xf${String(n).padStart(39, '0')}`;

// Every INSERT is its own part, and merges are stopped, so each address keeps its older rows, as
// in production between merges. The former holders' older rows outrank every current holder: the
// 1,200 of them exceed the candidates of the former capped query (limit + 2 * offset + 1000).
// h(5) and h(25) also have a higher row in the last part, at an older block than their latest.
const fixture = `
CREATE DATABASE balances;
CREATE DATABASE contracts;
CREATE DATABASE metadata;
CREATE TABLE balances.native_balances (
    block_num UInt32, block_hash String, timestamp DateTime(0, 'UTC'), address String, balance UInt256,
    INDEX idx_balance (balance) TYPE minmax GRANULARITY 1
) ENGINE = ReplacingMergeTree(block_num) ORDER BY address SETTINGS index_granularity = 64;
CREATE TABLE contracts.contracts (address String) ENGINE = MergeTree ORDER BY address;
CREATE TABLE metadata.metadata (network String, contract String, block_num UInt32, name String, symbol String, decimals UInt8)
    ENGINE = ReplacingMergeTree(block_num) ORDER BY (network, contract);
SYSTEM STOP MERGES balances.native_balances;
INSERT INTO balances.native_balances (block_num, block_hash, timestamp, address, balance)
    SELECT 100, '', '2026-10-01 00:00:00', concat('0xf', leftPad(toString(number), 39, '0')), toUInt256(1000 + number) * toUInt256('${TOKEN}')
    FROM numbers(1200);
INSERT INTO balances.native_balances (block_num, block_hash, timestamp, address, balance)
    SELECT 200, '', '2026-10-02 00:00:00', concat('0xf', leftPad(toString(number), 39, '0')), toUInt256(number % 2) * toUInt256('${TOKEN}')
    FROM numbers(1200);
INSERT INTO balances.native_balances (block_num, block_hash, timestamp, address, balance)
    SELECT 200, '', '2026-10-02 00:00:00', concat('0xa', leftPad(toString(number), 39, '0')), toUInt256(100 - number) * toUInt256('${TOKEN}')
    FROM numbers(30);
INSERT INTO balances.native_balances (block_num, block_hash, timestamp, address, balance) VALUES
    (150, '', '2026-10-01 12:00:00', '${h(5)}', toUInt256('${wei(5000)}')),
    (150, '', '2026-10-01 12:00:00', '${h(25)}', toUInt256('${wei(3000)}'));
INSERT INTO contracts.contracts VALUES ('${h(0)}');
INSERT INTO metadata.metadata VALUES ('mainnet', '0x0000000000000000000000000000000000000000', 1, 'Ether', 'ETH', 18);
`;

interface Holder {
    address: string;
    amount: string;
    last_update_block_num: number;
    is_contract: boolean | null;
    symbol: string | null;
}

function run(sql: string, params: Record<string, string>): Holder[] {
    const defaults = {
        db_balances: 'balances',
        db_contracts: 'contracts',
        network: 'mainnet',
        limit: '10',
        offset: '0',
    };
    const result = spawnSync(
        clickhouse ?? 'clickhouse',
        ['local', '--multiquery', ...Object.entries({ ...defaults, ...params }).map(([k, v]) => `--param_${k}=${v}`)],
        { input: `${fixture}\n${sql}\nFORMAT JSONEachRow;`, encoding: 'utf8', timeout: 30000 }
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}

const rows = (holders: Holder[]) => holders.map((r) => [r.address, r.amount]);
/** Every current holder, by balance: h(0) to h(29). */
const current = Array.from({ length: 30 }, (_, i) => [h(i), wei(100 - i)]);
/** The former holders that still hold 1 token, by address. */
const formerAtOneToken = Array.from({ length: 600 }, (_, k) => [f(2 * k + 1), wei(1)]);

describe.skipIf(!clickhouse)('EVM native holders on local tables', () => {
    it('ranks holders at or above the cutoff by their latest balance, whatever older rows hold', () => {
        const all = run(query, { cutoff: wei(80), limit: '1000' });
        // h(20) holds exactly the cutoff; h(21) to h(29) hold less, and so does h(25), whose older
        // row held 3,000 tokens; every former holder's latest balance is below it.
        expect(rows(all)).toEqual(current.slice(0, 21));
        const h5 = all.find((r) => r.address === h(5));
        expect(h5?.amount).toBe(wei(95));
        expect(h5?.last_update_block_num).toBe(200);
        expect(all[0]?.is_contract).toBe(true);
        expect(all[1]?.is_contract).toBe(false);
        expect(all[0]?.symbol).toBe('ETH');
    });

    it('pages down to the last holder at or above the cutoff, then comes back empty', () => {
        const page = (offset: number) => rows(run(query, { cutoff: wei(80), offset: String(offset) }));
        expect(page(0)).toEqual(current.slice(0, 10));
        expect(page(10)).toEqual(current.slice(10, 20));
        expect(page(20)).toEqual(current.slice(20, 21));
        expect(page(30)).toEqual([]);
    });

    it('ranks every address with a positive balance at cutoff 0', () => {
        const page = (offset: number, limit = 10) =>
            rows(run(queryAll, { limit: String(limit), offset: String(offset) }));
        expect(page(0)).toEqual(current.slice(0, 10));
        expect(page(30)).toEqual(formerAtOneToken.slice(0, 10));
        // No balance at 0, and h(5) and h(25) at their latest balances.
        expect(page(0, 1000)).toEqual([...current, ...formerAtOneToken]);
        expect(page(630)).toEqual([]);
    });
});
