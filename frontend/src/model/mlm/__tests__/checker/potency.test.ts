import { describe, it, expect } from 'vitest';
import type { Severity } from '../../checker/records';
import { runChecker } from '../../checker/runChecker';
import type { DeepClabject, DeepModel, StoredPotency } from '../../types';
import { bc1, id, mutate } from '../fixtures/bc1';

const has = (m: DeepModel, rule: string, el: string, sev: Severity) => expect(runChecker(m).records).toContainEqual(expect.objectContaining({ rule, element: el, severity: sev }));
const POT = ['WF-9', 'WF-10', 'WF-11', 'WF-18'];
const potRecords = (m: DeepModel) => runChecker(m).records.filter((r) => POT.includes(r.rule));
const withPot = (x: string, pot: StoredPotency) => mutate(bc1(), (e) => { e.get(id(x)).pot = pot; });
const msg = (m: DeepModel, rule: string, el: string) => potRecords(m).find((r) => r.rule === rule && r.element === id(el))?.message;

describe('potency rules WF-9, WF-10, WF-11, WF-18 (Task 10)', () => {
    it('WF-9 RacingBike (2,1,1)', () => {
        const m = withPot('O1/RacingBike', { start: 2, end: 1, depth: 1 });
        has(m, 'WF-9', id('O1/RacingBike'), 'error');
        expect(msg(m, 'WF-9', 'O1/RacingBike')).toBe("The potency of 'RacingBike' is invalid: start must not be greater than end.");
    });
    it('FR-8.8 RacingBike stored {start: 1, end: null, depth: null} gives WF-9 "all three"', () => {
        const m = withPot('O1/RacingBike', { start: 1, end: null, depth: null });
        has(m, 'WF-9', id('O1/RacingBike'), 'error');
        expect(msg(m, 'WF-9', 'O1/RacingBike')).toContain('all three');
    });
    it('FR-5.1 core: (2,1,1) gives exactly one WF-9 record on RacingBike', () =>
        expect(runChecker(withPot('O1/RacingBike', { start: 2, end: 1, depth: 1 })).records.filter((r) => r.rule === 'WF-9' && r.element === id('O1/RacingBike'))).toHaveLength(1));
    it('WF-10 RacingBike (1,1,3): depth not below its type', () => {
        const m = withPot('O1/RacingBike', { start: 1, end: 1, depth: 3 });
        has(m, 'WF-10', id('O1/RacingBike'), 'error');
        expect(msg(m, 'WF-10', 'O1/RacingBike')).toBe("'RacingBike' has potency 1-1-3, more than its type 'Bicycle' allows (1-1-2).");
    });
    it('WF-10 RacingBike (1,3,1): depth below its type, but reach + distance exceeds the type reach', () =>
        has(withPot('O1/RacingBike', { start: 1, end: 3, depth: 1 }), 'WF-10', id('O1/RacingBike'), 'error'));
    it('WF-11 O0 (1,1,2) reported on Bicycle', () => {
        const m = withPot('O0', { start: 1, end: 1, depth: 2 });
        has(m, 'WF-11', id('O0/Bicycle'), 'error');
        expect(msg(m, 'WF-11', 'O0/Bicycle')).toBe("'Bicycle' reaches 3 level(s) down, but its level 'O0' allows only 2.");
    });
    it('WF-18 Component.serialNumber (1,1,4) gives a warning on it', () => {
        const m = withPot('O0/Component/serialNumber', { start: 1, end: 1, depth: 4 });
        has(m, 'WF-18', id('O0/Component/serialNumber'), 'warning');
        expect(msg(m, 'WF-18', 'O0/Component/serialNumber')).toBe("Field 'Component.serialNumber' reaches 4 level(s) down, but 'Component' and its specialisations reach only 3.");
    });
    it('WF-18 counts the reach of the owner\'s specialisations (ix.subs)', () => {
        const m = mutate(withPot('O0/Component/serialNumber', { start: 1, end: 1, depth: 4 }), (e) => {
            const sub: DeepClabject = { id: 'O0/BigComponent', cls: 'Clabject', name: 'BigComponent', pot: { start: 1, end: 1, depth: 4 }, types: [], container: 'O0', isAbstract: null, isMultiType: null, supers: [id('O0/Component')], features: [] };
            e.set(sub.id, sub);
            e.get(id('O0')).elements.push(sub.id);
        });
        expect(potRecords(m).filter((r) => r.rule === 'WF-18')).toEqual([]);
    });
    it('no WF-9/10/11/18 on BC1, the field leap and the Customer variant (reach(Customer) = 3 <= reach(O0) = 3)', () => {
        for (const m of [bc1(), bc1({ fieldLeap: true }), bc1({ customer: true })]) expect(potRecords(m)).toEqual([]);
    });
});
