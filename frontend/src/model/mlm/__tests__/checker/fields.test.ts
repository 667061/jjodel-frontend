// FR-8.1 rows WF-12 ... WF-17, FR-7.2, FR-8.6, FR-8.8 second half, FR-8.9, FR-4.4, FR-4.6, Review Focus 4
import { describe, it, expect } from 'vitest';
import type { Severity } from '../../checker/records';
import { runChecker } from '../../checker/runChecker';
import type { DataTypeRef, DeepAttribute, DeepModel, Id, StoredPotency } from '../../types';
import { bc1, id, mutate, PRIM } from '../fixtures/bc1';

const FIELDS = ['WF-12', 'WF-13', 'WF-14', 'WF-15', 'WF-16', 'WF-17'];
const fieldRecords = (m: DeepModel) => runChecker(m).records.filter((r) => FIELDS.includes(r.rule));
const has = (m: DeepModel, rule: string, el: string, sev: Severity, message?: string) =>
    expect(fieldRecords(m)).toContainEqual(expect.objectContaining({ rule, element: el, severity: sev, ...(message !== undefined ? { message } : {}) }));
const hasNot = (m: DeepModel, rule: string, el: string) => expect(fieldRecords(m).filter((r) => r.rule === rule && r.element === el)).toEqual([]);
const prim = (name: keyof typeof PRIM): DataTypeRef => ({ kind: 'primitive', id: PRIM[name], name });
const withValue = (x: string, value: string | null) => mutate(bc1(), (e) => { e.get(id(x)).value = value; });

/** Adds an attribute to a clabject (inside a mutate edit). */
function addAttr(e: Map<Id, any>, owner: Id, attrId: Id, name: string, dataType: DataTypeRef, types: Id[], pot: StoredPotency, value: string | null = null): void {
    const a: DeepAttribute = { id: attrId, cls: 'Attribute', name, pot, types, container: owner, dataType, value };
    e.set(attrId, a);
    e.get(owner).features.push(attrId);
}
const P0: StoredPotency = { start: 1, end: 1, depth: 0 };

describe('field rules WF-12 to WF-17 (Task 11)', () => {
    it('WF-12 Frame134123.serialNumber loses its value -> warning', () =>
        has(withValue('O3/Frame134123/serialNumber', null), 'WF-12', id('O3/Frame134123/serialNumber'), 'warning', "Slot 'Frame134123.serialNumber' has no value."));
    it("WF-13 RacingBike.regularSalesPrice = '4999.00' -> warning", () =>
        has(withValue('O1/RacingBike/regularSalesPrice', '4999.00'), 'WF-13', id('O1/RacingBike/regularSalesPrice'), 'warning',
            "'RacingBike.regularSalesPrice' has a value but potency 1; the value is ignored."));
    it("WF-14 RocketA1XL.weight = '920 gr' -> error", () =>
        has(withValue('O2/RocketA1XL/weight', '920 gr'), 'WF-14', id('O2/RocketA1XL/weight'), 'error', "'920 gr' is not a valid EDouble for 'RocketA1XL.weight'."));
    it('FR-7.2 both values stay as entered', () => {
        const m = mutate(bc1(), (e) => { e.get(id('O2/RocketA1XL/weight')).value = '920 gr'; e.get(id('O1/RacingBike/regularSalesPrice')).value = '4999.00'; });
        const r = fieldRecords(m);
        expect(r).toContainEqual(expect.objectContaining({ rule: 'WF-14', element: id('O2/RocketA1XL/weight') }));
        expect(r).toContainEqual(expect.objectContaining({ rule: 'WF-13', element: id('O1/RacingBike/regularSalesPrice') }));
        expect((m.elements.get(id('O2/RocketA1XL/weight')) as DeepAttribute).value).toBe('920 gr');
        expect((m.elements.get(id('O1/RacingBike/regularSalesPrice')) as DeepAttribute).value).toBe('4999.00');
    });
    it("FR-8.8 WF-14 RocketA1XL.material = 'carbn'", () =>
        has(withValue('O2/RocketA1XL/material', 'carbn'), 'WF-14', id('O2/RocketA1XL/material'), 'error', "'carbn' is not a valid FrameMaterial for 'RocketA1XL.material'."));
    it("Review Focus 4: '920,0' and ' 920.0' are WF-14", () => {
        has(withValue('O2/RocketA1XL/weight', '920,0'), 'WF-14', id('O2/RocketA1XL/weight'), 'error');
        has(withValue('O2/RocketA1XL/weight', ' 920.0'), 'WF-14', id('O2/RocketA1XL/weight'), 'error');
    });
    it("Review Focus 4: 'TRUE' for EBoolean and '' for EDouble are WF-14, '' is not WF-12", () => {
        has(withValue('O1/RacingBike/suitedForRace', 'TRUE'), 'WF-14', id('O1/RacingBike/suitedForRace'), 'error');
        const empty = withValue('O2/RocketA1XL/weight', '');
        has(empty, 'WF-14', id('O2/RocketA1XL/weight'), 'error');
        hasNot(empty, 'WF-12', id('O2/RocketA1XL/weight'));
    });
    it('WF-15 Frame134123.serialNumber deleted -> warning on Frame134123', () => {
        const m = mutate(bc1(), (e) => { e.delete(id('O3/Frame134123/serialNumber')); e.get(id('O3/Frame134123')).features = []; });
        has(m, 'WF-15', id('O3/Frame134123'), 'warning', "'Frame134123' has no field for 'RocketA1XL.serialNumber', which its type requires.");
    });
    it('FR-8.6 RacingFrame gains colour: EString (1,1,2) -> WF-15 on RocketA1XL', () => {
        const m = mutate(bc1(), (e) => { addAttr(e, id('O1/RacingFrame'), id('O1/RacingFrame/colour'), 'colour', prim('EString'), [], { start: 1, end: 1, depth: 2 }); });
        has(m, 'WF-15', id('O2/RocketA1XL'), 'warning', "'RocketA1XL' has no field for 'RacingFrame.colour', which its type requires.");
        hasNot(m, 'WF-15', id('O3/Frame134123'));
    });
    it('WF-16 Frame134123.serialNumber typed by RacingBike.regularSalesPrice', () => {
        const m = mutate(bc1(), (e) => { e.get(id('O3/Frame134123/serialNumber')).types = [id('O1/RacingBike/regularSalesPrice')]; });
        has(m, 'WF-16', id('O3/Frame134123/serialNumber'), 'error',
            "Field 'Frame134123.serialNumber' is typed by 'RacingBike.regularSalesPrice', which is not a field of a type of 'Frame134123'.");
    });
    it('WF-17 / FR-4.4 RocketA1XL gets a second weight', () => {
        const m = mutate(bc1(), (e) => { addAttr(e, id('O2/RocketA1XL'), id('O2/RocketA1XL/weight#2'), 'weight', prim('EDouble'), [], P0, '1.0'); });
        has(m, 'WF-17', id('O2/RocketA1XL'), 'error', "'RocketA1XL' has 2 fields named 'weight'.");
    });
    it("FR-4.6 Bike134123.soldOn: EDate (1,1,0) '2017-09-19' passes, '19th of September' is WF-14", () => {
        const soldOn = (v: string) => mutate(bc1(), (e) => { addAttr(e, id('O3/Bike134123'), id('O3/Bike134123/soldOn'), 'soldOn', prim('EDate'), [], P0, v); });
        expect(fieldRecords(soldOn('2017-09-19'))).toEqual([...fieldRecords(bc1())]);
        has(soldOn('19th of September'), 'WF-14', id('O3/Bike134123/soldOn'), 'error', "'19th of September' is not a valid EDate for 'Bike134123.soldOn'.");
    });
    it("FR-8.9 WF-14 typeMismatch: RocketA1XL.weight as EString while RacingFrame.weight is EDouble", () => {
        const m = mutate(bc1(), (e) => { e.get(id('O2/RocketA1XL/weight')).dataType = prim('EString'); });
        has(m, 'WF-14', id('O2/RocketA1XL/weight'), 'error', "'RocketA1XL.weight' has type EString, but its type field 'RacingFrame.weight' has type EDouble.");
    });
    it('FR-8.9 WF-14 typeMismatch is skipped when a data type is unresolved', () =>
        hasNot(mutate(bc1(), (e) => { e.get(id('O2/RocketA1XL/weight')).dataType = { kind: 'unresolved', id: 'Pointer_gone' }; }), 'WF-14', id('O2/RocketA1XL/weight')));
    // Elias, 2026-11-25: a missing or unresolved data type is derived from the type field; if none can be derived, WF-14 noType
    it('WF-14 checks a value against the data type derived from the type field when the own one is missing or unresolved', () => {
        for (const dt of [null, { kind: 'unresolved', id: 'Pointer_gone' }]) {
            const bad = mutate(bc1(), (e) => { const a = e.get(id('O2/RocketA1XL/weight')); a.dataType = dt; a.value = '920 gr'; });
            has(bad, 'WF-14', id('O2/RocketA1XL/weight'), 'error', "'920 gr' is not a valid EDouble for 'RocketA1XL.weight'.");
            hasNot(mutate(bc1(), (e) => { e.get(id('O2/RocketA1XL/weight')).dataType = dt; }), 'WF-14', id('O2/RocketA1XL/weight'));
        }
    });
    it('WF-14 noType: an attribute whose data type is missing and cannot be derived', () => {
        has(mutate(bc1(), (e) => { e.get(id('O2/ChallengerA2XL/forTallCyclists')).dataType = null; }), 'WF-14', id('O2/ChallengerA2XL/forTallCyclists'), 'error',
            "'ChallengerA2XL.forTallCyclists' has no known data type.");
        has(mutate(bc1(), (e) => { e.get(id('O1/RacingFrame/material')).dataType = { kind: 'unresolved', id: 'Pointer_gone' }; }), 'WF-14', id('O1/RacingFrame/material'), 'error',
            "'RacingFrame.material' has no known data type.");
        // the derivation follows the type-field chain: only when no field on it has a data type is it noType
        const chain = (ids: string[]) => mutate(bc1(), (e) => { for (const x of ids) e.get(id(x)).dataType = null; });
        hasNot(chain(['O1/RacingFrame/weight', 'O2/RocketA1XL/weight']), 'WF-14', id('O2/RocketA1XL/weight'));
        has(chain(['O0/Component/weight', 'O1/RacingFrame/weight', 'O2/RocketA1XL/weight']), 'WF-14', id('O2/RocketA1XL/weight'), 'error',
            "'RocketA1XL.weight' has no known data type.");
    });
    // Slice review Important 2: a WF-9 potency on the attribute does not hide WF-14, and does not make WF-15 expect a field
    it('WF-14 is reported on an attribute whose stored potency is partial (WF-9)', () => {
        const m = mutate(bc1(), (e) => { const a = e.get(id('O2/RocketA1XL/weight')); a.pot = { start: 1, end: null, depth: null }; a.value = '920 gr'; a.dataType = prim('EString'); });
        const r = runChecker(m).records;
        expect(r).toContainEqual(expect.objectContaining({ rule: 'WF-9', element: id('O2/RocketA1XL/weight') }));
        expect(r).toContainEqual(expect.objectContaining({ rule: 'WF-14', element: id('O2/RocketA1XL/weight'), related: [id('O1/RacingFrame/weight')] }));
        expect(runChecker(withValue('O2/RocketA1XL/weight', '920 gr')).records.filter((x) => x.rule === 'WF-14')).toHaveLength(1);
        const lexical = mutate(bc1(), (e) => { const a = e.get(id('O2/RocketA1XL/weight')); a.pot = { start: 1, end: null, depth: null }; a.value = '920 gr'; });
        has(lexical, 'WF-14', id('O2/RocketA1XL/weight'), 'error', "'920 gr' is not a valid EDouble for 'RocketA1XL.weight'.");
    });
    it('WF-15 expects no field from a type field whose stored potency is partial (WF-9)', () =>
        hasNot(mutate(bc1(), (e) => { e.get(id('O2/RocketA1XL/weight')).pot = { start: 1, end: null, depth: null }; }), 'WF-15', id('O3/Frame134123')));
    it('FR-8.9 WF-16 sharedType: RocketA1XL gets weight2 typed by RacingFrame.weight', () => {
        const m = mutate(bc1(), (e) => { addAttr(e, id('O2/RocketA1XL'), id('O2/RocketA1XL/weight2'), 'weight2', prim('EDouble'), [id('O1/RacingFrame/weight')], P0, '1.0'); });
        expect(fieldRecords(m)).toContainEqual(expect.objectContaining({
            rule: 'WF-16', element: id('O2/RocketA1XL'), severity: 'error', message: "'RocketA1XL' has 2 fields typed by 'RacingFrame.weight'.",
            related: [id('O1/RacingFrame/weight'), id('O2/RocketA1XL/weight'), id('O2/RocketA1XL/weight2')],
        }));
    });
});
