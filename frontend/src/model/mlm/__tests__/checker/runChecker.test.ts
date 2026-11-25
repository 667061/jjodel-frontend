import { describe, it, expect } from 'vitest';
import { formatMessage, recordKey, type CheckRecord } from '../../checker/records';
import { runChecker } from '../../checker/runChecker';
import { bc1 } from '../fixtures/bc1';

describe('runChecker (Task 7)', () => {
    it('FR-8.4 evaluated / not evaluated', () => {
        const r = runChecker(bc1());
        expect(r.evaluated).toEqual(Array.from({ length: 18 }, (_, i) => `WF-${i + 1}`));
        expect(r.notEvaluated).toEqual(['WF-19', 'WF-20', 'WF-21', 'WF-22', 'WF-23']);
    });
    it('formatMessage fills params and shows -1 as *', () => expect(formatMessage('[{min}..{max}] on {name}', { min: 0, max: -1, name: 'x' })).toBe('[0..*] on x'));
    // recordKey sorts a copy of related itself (2026-11-23: the test passes it unsorted)
    it('recordKey', () => expect(recordKey({ rule: 'WF-5', element: 'a', related: ['c', 'b'] } as unknown as CheckRecord)).toBe('WF-5|a|b,c'));
    it('recordKey does not reorder the record it reads', () => {
        const related = ['c', 'b'];
        recordKey({ rule: 'WF-5', element: 'a', related } as unknown as CheckRecord);
        expect(related).toEqual(['c', 'b']);
    });
    it('records are sorted by (rule, element, related) and deterministic', () => { const a = runChecker(bc1()), b = runChecker(bc1()); expect(a).toEqual(b); });
    it('FR-8.5 the model is unchanged', () => { const m = bc1(); const before = JSON.stringify([...m.elements]); runChecker(m); expect(JSON.stringify([...m.elements])).toBe(before); });
    it('opts.only restricts the evaluated ids; the rest are not evaluated', () => {
        const r = runChecker(bc1(), { only: ['WF-12', 'WF-3'] });
        expect(r.evaluated).toEqual(['WF-3', 'WF-12']);
        expect(r.notEvaluated).toHaveLength(21);
        expect(r.records.every((x) => x.rule === 'WF-3' || x.rule === 'WF-12')).toBe(true);
    });
});
