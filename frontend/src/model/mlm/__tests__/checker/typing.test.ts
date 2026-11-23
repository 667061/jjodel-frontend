import { describe, it, expect } from 'vitest';
import type { Severity } from '../../checker/records';
import { runChecker } from '../../checker/runChecker';
import type { DeepClabject, DeepModel, Id, StoredPotency } from '../../types';
import { bc1, id, mutate } from '../fixtures/bc1';

const has = (m: DeepModel, rule: string, el: string, sev: Severity) => expect(runChecker(m).records).toContainEqual(expect.objectContaining({ rule, element: el, severity: sev }));
const TYPING = ['WF-4', 'WF-5', 'WF-6', 'WF-7', 'WF-8'];
const typingRecords = (m: DeepModel) => runChecker(m).records.filter((r) => TYPING.includes(r.rule));

/** Adds a clabject without features to a Model (inside a mutate edit). */
function addClabject(e: Map<Id, any>, model: Id, name: string, types: Id[], pot: StoredPotency): Id {
    const x = `${model}/${name}`;
    const c: DeepClabject = { id: x, cls: 'Clabject', name, pot, types, container: model, isAbstract: null, isMultiType: null, supers: [], features: [] };
    e.set(x, c);
    e.get(model).elements.push(x);
    return x;
}
const aeroFrame = (multi: boolean) => mutate(bc1(), (e) => {
    addClabject(e, id('O2'), 'AeroFrame', [id('O1/RacingFrame')], { start: 1, end: 1, depth: 1 });
    e.get(id('O3/Frame134123')).types = [id('O2/RocketA1XL'), id('O2/AeroFrame')];
    if (multi) e.get(id('O1/RacingFrame')).isMultiType = true;
});

describe('typing rules WF-4 to WF-8 (Task 9)', () => {
    it('WF-4 RacingFrame.weight typed by Component', () => {
        const m = mutate(bc1(), (e) => { e.get(id('O1/RacingFrame/weight')).types = [id('O0/Component')]; });
        has(m, 'WF-4', id('O1/RacingFrame/weight'), 'error');
        expect(typingRecords(m).find((r) => r.rule === 'WF-4')?.message).toBe("'RacingFrame.weight' is a Attribute, but its type 'Component' is a Clabject.");
    });
    it('WF-5 Frame134123 typed by RacingFrame (range variant)', () => {
        const m = mutate(bc1(), (e) => { e.get(id('O3/Frame134123')).types = [id('O1/RacingFrame')]; });
        has(m, 'WF-5', id('O3/Frame134123'), 'error');
        expect(typingRecords(m).find((r) => r.rule === 'WF-5' && r.element === id('O3/Frame134123'))?.message)
            .toBe("'Frame134123' is 2 level(s) below its type 'RacingFrame', which allows instances only 1 to 1 level(s) below.");
    });
    it('WF-5 a type on the same level (default variant)', () => {
        const m = mutate(bc1(), (e) => { e.get(id('O2/RocketA1XL')).types = [id('O2/ChallengerA2XL')]; });
        expect(typingRecords(m)).toContainEqual(expect.objectContaining({ rule: 'WF-5', element: id('O2/RocketA1XL'), message: "'ChallengerA2XL' is not on a level above 'RocketA1XL'." }));
    });
    // Review Focus 1: a Model typing cycle makes O0 leave anc(O1); the checker reports, it does not hang
    it('WF-5 under a Model typing cycle (O1 typed by O3)', () => has(mutate(bc1(), (e) => { e.get(id('O1')).types = [id('O3')]; }), 'WF-5', id('O1/RacingBike'), 'error'));
    it('WF-6 a clabject x on O3 typed by Bike134123', () => {
        const m = mutate(bc1(), (e) => { addClabject(e, id('O3'), 'x', [id('O3/Bike134123')], { start: 1, end: 1, depth: 0 }); });
        has(m, 'WF-6', id('O3/x'), 'error');
        expect(typingRecords(m).find((r) => r.rule === 'WF-6')?.message).toBe("'Bike134123' has potency 0 and cannot have instances, but 'x' is typed by it.");
    });
    it('WF-7 Component made abstract', () => {
        const m = mutate(bc1(), (e) => { e.get(id('O0/Component')).isAbstract = true; });
        has(m, 'WF-7', id('O1/RacingFrame'), 'error');
        expect(typingRecords(m).find((r) => r.rule === 'WF-7')?.message).toBe("'Component' is abstract, but 'RacingFrame' is a direct instance of it.");
    });
    it('WF-7 not for an indirect instance', () => expect(typingRecords(mutate(bc1(), (e) => { e.get(id('O0/Component')).isAbstract = true; })).filter((r) => r.rule === 'WF-7').map((r) => r.element)).toEqual([id('O1/RacingFrame')]));
    it('WF-8 Frame134123 typed by RocketA1XL and AeroFrame', () => {
        const m = aeroFrame(false);
        has(m, 'WF-8', id('O3/Frame134123'), 'error');
        expect(typingRecords(m).find((r) => r.rule === 'WF-8')?.message).toBe("'Frame134123' has 2 types; multiple typing is not permitted here.");
    });
    it('WF-8 not reported when both types are instances of a clabject with isMultiType (OPEN-6 reading (b))', () =>
        expect(typingRecords(aeroFrame(true)).filter((r) => r.rule === 'WF-8')).toEqual([]));
    it('BC1, field-leap BC1 and Customer variant have no WF-4...WF-8 record', () => {
        for (const m of [bc1(), bc1({ fieldLeap: true }), bc1({ customer: true })]) expect(typingRecords(m)).toEqual([]);
    });
    // Review Focus 2 (slice review Important 1): a type deleted outside the MLM tab is reported by WF-5, not passed over
    it('WF-5 a dangling type id of a clabject', () => expect(typingRecords(mutate(bc1(), (e) => { e.get(id('O2/RocketA1XL')).types = ['Pointer_gone']; }))).toEqual([
        expect.objectContaining({ rule: 'WF-5', element: id('O2/RocketA1XL'), severity: 'error', related: ['Pointer_gone'], message: "'Pointer_gone' is not on a level above 'RocketA1XL'." })]));
    it('WF-5 a dangling type id of a feature', () => expect(typingRecords(mutate(bc1(), (e) => { e.get(id('O2/RocketA1XL/weight')).types = ['Pointer_gone']; }))).toEqual([
        expect.objectContaining({ rule: 'WF-5', element: id('O2/RocketA1XL/weight'), message: "'Pointer_gone' is not on a level above 'RocketA1XL.weight'." })]));
    // Review Focus 1 (slice review Minor 3): cycles in supers and in clabject types reach every rule and terminate
    it('runChecker terminates on a supers cycle (Component <-> Bicycle) and on a self-super', () => {
        expect(() => runChecker(mutate(bc1(), (e) => { e.get(id('O0/Component')).supers = [id('O0/Bicycle')]; e.get(id('O0/Bicycle')).supers = [id('O0/Component')]; }))).not.toThrow();
        expect(() => runChecker(mutate(bc1(), (e) => { e.get(id('O1/RacingFrame')).supers = [id('O1/RacingFrame')]; }))).not.toThrow();
    });
    it('runChecker terminates on a clabject types cycle and reports it through WF-5', () => {
        has(mutate(bc1(), (e) => { e.get(id('O1/RacingFrame')).types = [id('O3/Frame134123')]; }), 'WF-5', id('O1/RacingFrame'), 'error');
        has(mutate(bc1(), (e) => { e.get(id('O2/RocketA1XL')).types = [id('O2/RocketA1XL')]; }), 'WF-5', id('O2/RocketA1XL'), 'error');
    });
});
