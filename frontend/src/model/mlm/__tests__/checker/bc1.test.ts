// The slice's integration tests: FR-8.2, FR-8.3, FR-8.4 (registry), NFR-6.2
import { describe, it, expect } from 'vitest';
import { recordKey } from '../../checker/records';
import { RULES } from '../../checker/registry';
import { FIELD_RULES } from '../../checker/rules/fields';
import { LEVEL_RULES } from '../../checker/rules/levels';
import { POTENCY_RULES } from '../../checker/rules/potency';
import { TYPING_RULES } from '../../checker/rules/typing';
import { runChecker } from '../../checker/runChecker';
import type { DeepModel } from '../../types';
import { bc1, id, mutate, scaleModel } from '../fixtures/bc1';

/** A spec §4 template as a regex: every {param} matches one or more characters. */
const templateRegex = (t: string) => new RegExp('^' + t.split(/\{\w+\}/).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+') + '$');

/** Fixtures with records of many rules, for FR-8.3. */
const fixtures = (): DeepModel[] => [
    bc1(),
    mutate(bc1(), (e) => { e.get(id('O2')).elements.push(id('O1/RacingFrame')); e.get(id('O2')).level = 3; }),
    mutate(bc1(), (e) => { e.get(id('O1')).types = [id('O3')]; }),
    mutate(bc1(), (e) => { e.get(id('O1/RacingFrame/weight')).types = [id('O0/Component')]; e.get(id('O3/Frame134123')).types = [id('O1/RacingFrame')]; }),
    mutate(bc1(), (e) => { e.get(id('O1/RacingBike')).pot = { start: 1, end: 1, depth: 3 }; e.get(id('O0')).pot = { start: 1, end: 1, depth: 2 }; }),
    mutate(bc1(), (e) => { e.get(id('O2/RocketA1XL/weight')).value = '920 gr'; e.get(id('O1/RacingBike/regularSalesPrice')).value = '4999.00'; }),
    mutate(bc1(), (e) => { e.get(id('O3/Frame134123/serialNumber')).types = [id('O1/RacingBike/regularSalesPrice')]; }),
];

describe('BC1 checker integration (Task 11)', () => {
    it('FR-8.2 BC1 gives exactly the four WF-12 warnings on RocketA1XL', () => expect(runChecker(bc1()).records.map((r) => [r.rule, r.severity, r.element])).toEqual(
        ['downTubeLength', 'material', 'seatTubeLength', 'topTubeLength'].map((f) => ['WF-12', 'warning', id(`O2/RocketA1XL/${f}`)])));
    it('FR-8.2 with WF12_TEST_VALUES, the field leap and the Customer variant: no record', () => {
        for (const m of [bc1({ wf12Values: true }), bc1({ wf12Values: true, fieldLeap: true }), bc1({ wf12Values: true, customer: true })]) expect(runChecker(m).records).toEqual([]);
    });
    it('FR-8.3 every record has rule, severity, element, related, params and the §4 message', () => {
        const rules = new Map(RULES.map((r) => [r.id, r]));
        let n = 0;
        for (const m of fixtures()) {
            for (const r of runChecker(m).records) {
                n++;
                expect(rules.has(r.rule)).toBe(true);
                expect(['error', 'warning']).toContain(r.severity);
                expect(typeof r.element).toBe('string');
                expect(r.related).toEqual([...r.related].sort());
                expect(typeof r.params).toBe('object');
                expect(r.message).not.toMatch(/\{\w+\}/);
                expect(Object.values(rules.get(r.rule)!.templates).some((t) => templateRegex(t).test(r.message))).toBe(true);
            }
        }
        expect(n).toBeGreaterThan(15); // positive control: the fixtures do produce records
    });
    it('FR-8.3 two runs, and runs on a structured copy (stand-in for save-reload), give the same record keys', () => {
        for (const m of fixtures()) {
            const keys = (x: DeepModel) => runChecker(x).records.map(recordKey);
            expect(keys(m)).toEqual(keys(m));
            expect(keys(structuredClone(m))).toEqual(keys(m));
        }
    });
    it('message of WF-12', () => expect(runChecker(bc1()).records[1].message).toBe("Slot 'RocketA1XL.material' has no value."));
    // Brief S2 point 5: no placeholder may survive Task 11.
    it('RULES holds exactly the rules of the four rule files, WF-1 to WF-18, each once', () => {
        const exported = [...LEVEL_RULES, ...TYPING_RULES, ...POTENCY_RULES, ...FIELD_RULES].map((r) => r.id);
        const wf1to18 = Array.from({ length: 18 }, (_, i) => `WF-${i + 1}`);
        expect([...exported].sort()).toEqual([...wf1to18].sort());
        expect(RULES.map((r) => r.id)).toEqual(wf1to18);
        expect(RULES.every((r) => exported.includes(r.id) && [...LEVEL_RULES, ...TYPING_RULES, ...POTENCY_RULES, ...FIELD_RULES].includes(r))).toBe(true);
    });
    it('the scale model has 300 clabjects and no record (planner and checker agree)', () => {
        const m = scaleModel(300);
        expect([...m.elements.values()].filter((e) => e.cls === 'Clabject')).toHaveLength(300);
        expect(runChecker(m).records).toEqual([]);
    });
    it('NFR-6.2 checker time on a generated ~300-clabject model is logged', () => {
        const m = scaleModel(300);
        runChecker(m); // warm-up
        const times: number[] = [];
        for (let i = 0; i < 7; i++) { const t0 = performance.now(); runChecker(m); times.push(performance.now() - t0); }
        times.sort((a, b) => a - b);
        console.log(`[NFR-6.2] runChecker on ${m.elements.size} elements: ${times[3].toFixed(1)} ms (median of 7 runs after one warm-up; min ${times[0].toFixed(1)}, max ${times[6].toFixed(1)}; target <= 50 ms)`);
    });
});
