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
