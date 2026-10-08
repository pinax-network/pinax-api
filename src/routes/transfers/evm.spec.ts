import { describe, expect, it } from 'bun:test';
import { normalizeSQL } from '../../sql/index.js';
import query from './evm.sql' with { type: 'text' };

describe('EVM transfers SQL regressions', () => {
    const sql = normalizeSQL(query);

    it('filters transfer contracts on the source log_address column', () => {
        expect(sql).toContain('WHERE (notEmpty({contract:Array(String)}) AND log_address IN {contract:Array(String)})');
        expect(sql).toContain('(empty({contract:Array(String)})');
        expect(sql).toContain('OR log_address IN {contract:Array(String)})');
    });
});

describe('EVM transfers SQL scan count', () => {
    const sql = normalizeSQL(query);

    // ClickHouse inlines a CTE at every reference; `IN (SELECT contract FROM contracts)` re-ran filtered_transfers inside the metadata lookup (2 scans per request).
    it('collects the page contracts once through a scalar subquery', () => {
        expect(sql).not.toContain('contract IN (SELECT contract FROM contracts)');
        expect(sql).toContain('contract IN (SELECT arrayJoin((SELECT contracts FROM page_contracts)))');
    });

    it('reads the candidate minutes through a scalar subquery', () => {
        expect(sql).toContain('minute IN (SELECT arrayJoin((SELECT groupArray(minute) FROM filtered_minutes)))');
    });
});
