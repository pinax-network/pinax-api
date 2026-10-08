import { describe, expect, it } from 'bun:test';
import query from './svm.sql' with { type: 'text' };

function whitespaceAgnostic(pattern: string) {
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll(/\s+/g, '\\s+'));
}

describe('SVM transfers SQL scan count', () => {
    // ClickHouse inlines a CTE at every reference; each `IN <cte>` in a lookup re-ran the transfers scan.
    it('collects the page mints once through a scalar subquery', () => {
        expect(query).not.toMatch(/WHERE\s+mint\s+IN\s+mints\b/);
        expect(query.match(/WHERE mint IN \(SELECT arrayJoin\(\(SELECT mints FROM page_mints\)\)\)/g)).toHaveLength(2);
    });

    it('reads the candidate minutes through a scalar subquery', () => {
        expect(query).toMatch(
            whitespaceAgnostic(
                'toRelativeMinuteNum(timestamp) IN (SELECT arrayJoin((SELECT groupArray(minute) FROM filtered_minutes)))'
            )
        );
    });
});
