import { describe, it, expect } from 'vitest';
import { buildIndex } from '../deepIndex';
import { planInstantiate, type InstantiatePlan, type Refusal } from '../plans';
import { formatPotency } from '../potency';
import { bc1, id, mutate, PRIM } from './fixtures/bc1';

const base = bc1({ customer: true }), ix = buildIndex(base);
const onlyO0 = bc1({ clabjectsUpTo: 0 });
/** [name, typeOf, potency as s-e-d, dataType] per planned field; fails the test when the plan is a refusal. */
const fieldsOf = (p: InstantiatePlan | Refusal) => {
    if (!p.ok) throw new Error(`expected a plan, got a refusal: ${p.message}`);
    return p.fields.map((f) => [f.name, f.typeOf, formatPotency(f.pot), f.dataType] as [string, string, string, string | null]);
};

describe('planInstantiate', () => {
    it('FR-6.1 Component → O1', () => {
        const p = planInstantiate(onlyO0, buildIndex(onlyO0), { typeId: id('O0/Component'), targetModelId: id('O1'), name: 'RacingFrame' });
        expect(p).toMatchObject({ ok: true, distance: 1, clabject: { types: [id('O0/Component')], pot: { start: 1, end: 1, depth: 2 }, isAbstract: false, isMultiType: false } });
        expect(fieldsOf(p)).toEqual([['weight', id('O0/Component/weight'), '1-1-1', PRIM.EDouble], ['serialNumber', id('O0/Component/serialNumber'), '1-1-2', PRIM.EString]]);
    });
    it('FR-6.2 RacingFrame → O2 gets exactly six fields', () => {
        const p = planInstantiate(base, ix, { typeId: id('O1/RacingFrame'), targetModelId: id('O2'), name: 'FrameModel2' });
        expect(fieldsOf(p).map((f) => [f[0], f[2]])).toEqual([['weight', '1-1-0'], ['serialNumber', '1-1-1'], ['topTubeLength', '1-1-0'], ['downTubeLength', '1-1-0'], ['seatTubeLength', '1-1-0'], ['material', '1-1-0']]);
        expect(fieldsOf(p).every((f) => !f[1].startsWith('O0/'))).toBe(true);
        expect(fieldsOf(p).find((f) => f[0] === 'material')![3]).toBe('enum/FrameMaterial');
    });
    it('FR-6.3 field leap', () => {
        const m = bc1({ fieldLeap: true });
        const p = planInstantiate(m, buildIndex(m), { typeId: id('O2/RocketA1XL'), targetModelId: id('O3'), name: 'F2' });
        expect(fieldsOf(p)).toEqual([['serialNumber', id('O0/Component/serialNumber'), '1-1-0', PRIM.EString]]);
    });
    it('FR-6.8 Customer → O3', () => {
        const p = planInstantiate(base, ix, { typeId: id('O0/Customer'), targetModelId: id('O3'), name: 'Susan2', values: { fullName: 'Susan Storm' } });
        expect(p).toMatchObject({ ok: true, distance: 3, clabject: { pot: { start: 1, end: 1, depth: 0 } } });
        expect((p as InstantiatePlan).fields[0]).toMatchObject({ name: 'fullName', typeOf: id('O0/Customer/fullName'), value: 'Susan Storm' });
    });
    it.each([
        ['d = 0', id('O3/Bike134123'), id('O3')], ['out of range (k=2 ∉ [1..1])', id('O0/Component'), id('O2')],
        ['Customer to O1', id('O0/Customer'), id('O1')], ['own level', id('O1/RacingFrame'), id('O1')],
    ])('FR-6.4 refuses %s', (_, typeId, target) => expect(planInstantiate(base, ix, { typeId, targetModelId: target, name: 'X' }).ok).toBe(false));
    it('FR-6.4 refuses an abstract type', () => {
        const m = mutate(onlyO0, (e) => { e.get(id('O0/Component')).isAbstract = true; });
        expect(planInstantiate(m, buildIndex(m), { typeId: id('O0/Component'), targetModelId: id('O1'), name: 'X' }).ok).toBe(false);
    });
    it('refuses an empty name and a name taken on the target level', () => {
        expect(planInstantiate(base, ix, { typeId: id('O2/RocketA1XL'), targetModelId: id('O3'), name: '' }).ok).toBe(false);
        expect(planInstantiate(base, ix, { typeId: id('O2/RocketA1XL'), targetModelId: id('O3'), name: 'Frame134123' })).toMatchObject({ ok: false });
    });
    it('refusal message names the rule', () => expect((planInstantiate(base, ix, { typeId: id('O0/Component'), targetModelId: id('O2'), name: 'X' }) as Refusal).message)
        .toBe("'Component' can be instantiated only 1 to 1 level(s) below, not 2 (R-INST-1, R-POT-2)"));
    it('Review Focus 2: a dangling type id on the instance does not break planning', () => {
        const m = mutate(base, (e) => { e.get(id('O2/RocketA1XL')).types.push('Pointer_gone'); });
        expect(planInstantiate(m, buildIndex(m), { typeId: id('O2/RocketA1XL'), targetModelId: id('O3'), name: 'F3' }).ok).toBe(true);
    });
    it('needs list metaclasses and free names', () => expect((planInstantiate(base, ix, { typeId: id('O2/RocketA1XL'), targetModelId: id('O3'), name: 'F4' }) as InstantiatePlan).needs)
        .toMatchObject({ metaclasses: ['Clabject', 'Attribute'], freeNames: [{ containerId: id('O3'), names: ['F4'] }] }));
    // Review fix #1: instOf goes through supers* (spec §3.0), so the types of a type's supers count for R-INST-3.
    it('R-INST-3: fields of a super\'s type are planned', () => {
        const m = mutate(base, (e) => {
            e.set('O0/Bicycle/wheelSize', { id: 'O0/Bicycle/wheelSize', cls: 'Attribute', name: 'wheelSize', pot: { start: 2, end: 2, depth: 1 }, types: [], container: id('O0/Bicycle'),
                dataType: { kind: 'primitive', id: PRIM.EDouble, name: 'EDouble' }, value: null });
            e.get(id('O0/Bicycle')).features.push('O0/Bicycle/wheelSize');
            e.set('O1/Other', { id: 'O1/Other', cls: 'Clabject', name: 'Other', pot: { start: 1, end: 1, depth: 2 }, types: [id('O0/Bicycle')], container: id('O1'),
                isAbstract: null, isMultiType: null, supers: [], features: [] });
            e.get(id('O1')).elements.push('O1/Other');
            e.get(id('O1/RacingFrame')).supers = ['O1/Other'];
        });
        expect(fieldsOf(planInstantiate(m, buildIndex(m), { typeId: id('O1/RacingFrame'), targetModelId: id('O2'), name: 'FM' })))
            .toContainEqual(['wheelSize', 'O0/Bicycle/wheelSize', '1-1-0', PRIM.EDouble]);
    });
    it('refuses a name made only of spaces', () => expect(planInstantiate(base, ix, { typeId: id('O2/RocketA1XL'), targetModelId: id('O3'), name: '  ' }).ok).toBe(false));
    // The shared fixture is untouched by the in-place push above (brief correction 2).
    it('mutate does not leak into the shared fixture', () => expect(base.elements.get(id('O2/RocketA1XL'))!.types).toEqual([id('O1/RacingFrame')]));
});
