import { describe, expect, it } from 'bun:test';
import query from './svm.sql' with { type: 'text' };

describe('SVM balances SQL scan count', () => {
    // The page is resolved once into the `page_arr` scalar; lookups must read it, not re-scan balances_by_account.
    it('reads balances_by_account once, through the page scalar', () => {
        expect(query.match(/\.balances_by_account\b/g)).toHaveLength(1);
        expect(query).toContain(') AS page_arr,');
        expect(query).toContain('FROM (SELECT arrayJoin(page_arr) AS t)');
    });
});
