import { describe, expect, it } from 'bun:test';
import { normalizeSQL } from '../../sql/index.js';
import query from './evm.sql' with { type: 'text' };

describe('EVM swaps SQL regressions', () => {
    const sql = normalizeSQL(query);

    it('applies the same protocol comparison in prefilter and final row filter', () => {
        expect(sql).toContain(
            'WHERE (isNotNull({protocol:Nullable(String)}) AND protocol = {protocol:Nullable(String)})'
        );
        expect(sql).toContain('(isNull({protocol:Nullable(String)})');
        expect(sql).toContain('OR protocol = {protocol:Nullable(String)})');
        expect(sql).not.toContain("replaceAll({protocol:Nullable(String)}, '_', '-')");
    });

    it('maps EVM caller and transaction_from filters to separate DB fields', () => {
        expect(sql).toContain('WHERE (notEmpty({caller:Array(String)}) AND call_caller IN {caller:Array(String)})');
        expect(sql).toContain(
            'WHERE (notEmpty({transaction_from:Array(String)}) AND tx_from IN {transaction_from:Array(String)})'
        );
        expect(sql).toContain('WHERE (notEmpty({user:Array(String)}) AND user IN {user:Array(String)})');
        expect(sql).toContain('(empty({caller:Array(String)})              OR call_caller IN {caller:Array(String)})');
        expect(sql).toContain(
            '(empty({transaction_from:Array(String)})    OR tx_from IN {transaction_from:Array(String)})'
        );
        expect(sql).toContain('(empty({user:Array(String)})                OR user IN {user:Array(String)})');
    });

    it('selects the new swap ordering and log aliases', () => {
        expect(sql).toContain('s.tx_index AS transaction_index');
        expect(sql).toContain('s.tx_from AS transaction_from');
        expect(sql).toContain('s.call_index AS call_index');
        expect(sql).toContain('s.log_ordinal AS log_ordinal');
        expect(sql).toContain('s.log_block_index AS log_block_index');
        expect(sql).toContain('s.log_topic0 AS log_topic0');
        expect(sql).toContain('s.call_caller AS caller');
        expect(sql).toContain('s.user AS user');
        expect(sql).toContain('s.user AS recipient');
    });
});
