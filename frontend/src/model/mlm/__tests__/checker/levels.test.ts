import { describe, it, expect } from 'vitest';
import type { Severity } from '../../checker/records';
import { runChecker } from '../../checker/runChecker';
import type { DeepModel } from '../../types';
import { bc1, id, mutate } from '../fixtures/bc1';

const has = (m: DeepModel, rule: string, el: string, sev: Severity) => expect(runChecker(m).records).toContainEqual(expect.objectContaining({ rule, element: el, severity: sev }));
const levelRecords = (m: DeepModel) => runChecker(m).records.filter((r) => ['WF-1', 'WF-2', 'WF-3'].includes(r.rule));

describe('level rules WF-1 to WF-3 (Task 8)', () => {
    it('WF-1 RacingFrame also in O2.elements', () => has(mutate(bc1(), (e) => { e.get(id('O2')).elements.push(id('O1/RacingFrame')); }), 'WF-1', id('O1/RacingFrame'), 'error'));
    it('WF-1 message', () => expect(levelRecords(mutate(bc1(), (e) => { e.get(id('O2')).elements.push(id('O1/RacingFrame')); }))).toContainEqual(
        expect.objectContaining({ rule: 'WF-1', message: "Clabject 'RacingFrame' belongs to 2 levels; it must belong to exactly one.", related: [id('O1'), id('O2')] })));
    it('WF-1 a clabject listed by no level', () => has(mutate(bc1(), (e) => { e.get(id('O2')).elements = [id('O2/ChallengerA2XL')]; }), 'WF-1', id('O2/RocketA1XL'), 'error'));
    it('WF-2 O2 typed by Bicycle', () => has(mutate(bc1(), (e) => { e.get(id('O2')).types = [id('O0/Bicycle')]; }), 'WF-2', id('O2'), 'error'));
    // Review Focus 1
    it('WF-2 Model typing cycle reported, not hanging', () => has(mutate(bc1(), (e) => { e.get(id('O1')).types = [id('O3')]; }), 'WF-2', id('O1'), 'error'));
    it('WF-2 two types', () => has(mutate(bc1(), (e) => { e.get(id('O2')).types = [id('O1'), id('O0')]; }), 'WF-2', id('O2'), 'error'));
    // Review Focus 2
    it('WF-2 a dangling type id', () => has(mutate(bc1(), (e) => { e.get(id('O2')).types = ['Pointer_gone']; }), 'WF-2', id('O2'), 'error'));
    it('WF-2 message', () => expect(levelRecords(mutate(bc1(), (e) => { e.get(id('O2')).types = [id('O0/Bicycle')]; })).find((r) => r.rule === 'WF-2')?.message)
        .toBe("Level 'O2' must be an instance of exactly one level above it."));
    it('WF-3 O2 numbered 3', () => {
        const r = runChecker(mutate(bc1(), (e) => { e.get(id('O2')).level = 3; }));
        expect(r.records).toContainEqual(expect.objectContaining({ rule: 'WF-3', element: id('O2'), message: "Level 'O2' is numbered 3, but its type 'O1' allows only 2 to 2." }));
    });
    it('WF-3 top level numbered 1', () => expect(levelRecords(mutate(bc1(), (e) => { e.get(id('O0')).level = 1; }))).toContainEqual(
        expect.objectContaining({ rule: 'WF-3', element: id('O0'), severity: 'error', message: "Top level 'O0' must be numbered 0." })));
    it('WF-3 a level under a type without potency must be one below it', () => {
        const m = mutate(bc1(), (e) => { e.get(id('O1')).pot = { start: null, end: null, depth: null }; e.get(id('O2')).level = 3; });
        expect(levelRecords(m)).toContainEqual(expect.objectContaining({ rule: 'WF-3', element: id('O2'), message: "Level 'O2' is numbered 3, but its type 'O1' allows only 2 to 2." }));
    });
    it('BC1 has no level records', () => expect(levelRecords(bc1())).toEqual([]));
    it('the leap variants have no level records', () => {
        expect(levelRecords(bc1({ fieldLeap: true }))).toEqual([]);
        expect(levelRecords(bc1({ customer: true }))).toEqual([]);
    });
});
