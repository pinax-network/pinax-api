import { describe, expect, it } from 'bun:test';
import query from './svm.sql' with { type: 'text' };

const requiredPredicates = {
    signature: '(empty({signature:Array(String)}) OR signature IN {signature:Array(String)})',
    amm: '(empty({amm:Array(String)}) OR amm IN {amm:Array(String)})',
    amm_pool: '(empty({amm_pool:Array(String)}) OR amm_pool IN {amm_pool:Array(String)})',
    user: '(empty({user:Array(String)}) OR user IN {user:Array(String)})',
    input_mint: '(empty({input_mint:Array(String)}) OR input_mint IN {input_mint:Array(String)})',
    output_mint: '(empty({output_mint:Array(String)}) OR output_mint IN {output_mint:Array(String)})',
    program_id: '(empty({program_id:Array(String)}) OR program_id IN {program_id:Array(String)})',
};

function whitespaceAgnostic(pattern: string) {
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll(/\s+/g, '\\s+'));
}

describe('SVM swaps SQL filters', () => {
    for (const [filter, predicate] of Object.entries(requiredPredicates)) {
        it(`applies ${filter} as a row-level predicate`, () => {
            expect(query).toMatch(whitespaceAgnostic(predicate));
        });
    }
});

describe('SVM swaps SQL scan count', () => {
    // ClickHouse inlines a CTE at every reference; each `IN <cte>` below a join re-ran the swaps scan (#593).
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
