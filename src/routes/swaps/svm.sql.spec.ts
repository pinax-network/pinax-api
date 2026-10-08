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
    // minutes_union has a protocol branch; uncounted, protocol + another filter took the union of their
    // minutes instead of the intersection and could return no rows despite matches.
    it('counts protocol as an active filter', () => {
        expect(query).toMatch(
            whitespaceAgnostic('n_other + toUInt8(n_other > 0 AND isNotNull({protocol:Nullable(String)})) AS n')
        );
        expect(query).toMatch(
            whitespaceAgnostic(
                'WHERE (isNotNull({protocol:Nullable(String)}) AND protocol = {protocol:Nullable(String)})'
            )
        );
    });

    for (const [filter, predicate] of Object.entries(requiredPredicates)) {
        it(`applies ${filter} as a row-level predicate`, () => {
            expect(query).toMatch(whitespaceAgnostic(predicate));
        });
    }
});
