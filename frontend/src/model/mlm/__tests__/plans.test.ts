import { describe, it, expect } from 'vitest';
import { buildIndex } from '../deepIndex';
import { planAddAttribute, planAddEnumeration, planAddLevel, planDelete, type AddLevelPlan, type DeletePlan } from '../plans';
import { formatPotency } from '../potency';
import type { DeepLevel, DeepModel } from '../types';
import { bc1, id, mutate, NONE, PRIM } from './fixtures/bc1';

/** n times planAddLevel on the last Model; each plan is inserted as a DeepLevel with id = plan.name, types [typeModelId]. Returns the plans. */
function chain(m: DeepModel, n: number): AddLevelPlan[] {
    const plans: AddLevelPlan[] = [];
    let cur = m;
    let last = m.order.filter((x) => m.elements.get(x)?.cls === 'Model').at(-1)!;
    for (let i = 0; i < n; i++) {
        const p = planAddLevel(cur, buildIndex(cur), { typeModelId: last });
        if (!p.ok) throw new Error(`step ${i + 1} refused: ${p.message}`);
        plans.push(p);
        const lv: DeepLevel = { id: p.name, cls: 'Model', name: p.name, pot: p.pot ?? NONE, types: [p.typeModelId], container: null, level: p.level, elements: [], ownedEnumerations: [] };
        cur = mutate(cur, (e) => { e.set(lv.id, lv); });
        cur = { ...cur, order: [...cur.order, lv.id] };
        last = lv.id;
    }
    return plans;
}

describe('planAddLevel', () => {
    it('FR-2.1 three levels under O0 (1,1,3)', () => expect(chain(bc1({ onlyTop: true }), 3).map((l) => [l.level, formatPotency(l.pot)]))
        .toEqual([[1, '1-1-2'], [2, '1-1-1'], [3, '1-1-0']]));
    it('FR-2.1 each new level is typed by the one above', () => expect(chain(bc1({ onlyTop: true }), 3).map((l) => l.typeModelId)).toEqual(['O0', 'O1', 'O2']));
    it('FR-2.2 refuses a level below a d = 0 level', () => expect(planAddLevel(bc1(), buildIndex(bc1()), { typeModelId: id('O3') }).ok).toBe(false));
    it('FR-2.3 without potency: no potency, level + 1, five levels deep', () => {
        const top = mutate(bc1({ onlyTop: true }), (e) => { e.get(id('O0')).pot = NONE; });
        const ls = chain(top, 5);
        expect(ls.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
        expect(ls.every((l) => l.pot === null)).toBe(true);
    });
    it('default level name is O<level>', () => { const t = bc1({ onlyTop: true }); expect((planAddLevel(t, buildIndex(t), { typeModelId: id('O0') }) as AddLevelPlan).name).toBe('O1'); });
});

describe('planAddAttribute', () => {
    it('FR-4.4 planAddAttribute allows a duplicate name (WF-17 reports it later)', () => expect(planAddAttribute(bc1(), buildIndex(bc1()), { ownerId: id('O2/RocketA1XL'), name: 'weight', dataType: PRIM.EDouble }).ok).toBe(true));
    it('planAddAttribute refuses an empty name', () => expect(planAddAttribute(bc1(), buildIndex(bc1()), { ownerId: id('O2/RocketA1XL'), name: '', dataType: PRIM.EDouble }).ok).toBe(false));
});

describe('planAddEnumeration', () => {
    it('planAddEnumeration refuses no literals and duplicate literals', () => {
        const t = bc1({ onlyTop: true }), tx = buildIndex(t);
        expect(planAddEnumeration(t, tx, { levelId: id('O0'), name: 'Colour', literals: [] }).ok).toBe(false);
        expect(planAddEnumeration(t, tx, { levelId: id('O0'), name: 'Colour', literals: ['red', 'red'] }).ok).toBe(false);
        expect(planAddEnumeration(t, tx, { levelId: id('O0'), name: 'FrameMaterial', literals: ['x'] }).ok).toBe(false); // name taken on the level
    });
    it('accepts a new enumeration', () => { const t = bc1({ onlyTop: true }); expect(planAddEnumeration(t, buildIndex(t), { levelId: id('O0'), name: 'Colour', literals: ['red', 'blue'] }).ok).toBe(true); });
});

describe('blank names (review fix #3)', () => {
    it('every planner refuses a name made only of spaces', () => {
        const t = bc1({ onlyTop: true }), tx = buildIndex(t);
        expect(planAddLevel(t, tx, { typeModelId: id('O0'), name: ' ' }).ok).toBe(false);
        expect(planAddAttribute(bc1(), buildIndex(bc1()), { ownerId: id('O2/RocketA1XL'), name: '  ', dataType: PRIM.EDouble }).ok).toBe(false);
        expect(planAddEnumeration(t, tx, { levelId: id('O0'), name: '  ', literals: ['red'] }).ok).toBe(false);
        expect(planAddEnumeration(t, tx, { levelId: id('O0'), name: 'Colour', literals: [' '] }).ok).toBe(false);
    });
});

describe('planDelete', () => {
    it('FR-5.3 deleting RacingFrame cascades to two instances and their fields', () => {
        const p = planDelete(bc1(), buildIndex(bc1()), [id('O1/RacingFrame')]) as DeletePlan;
        expect(p.cascade.filter((x) => !x.includes('/', x.indexOf('/') + 1)).sort()).toEqual([id('O2/RocketA1XL'), id('O3/Frame134123')].sort());
        expect(p.summary.instances).toBe(2);
        expect(p.order.at(-1)).toBe(id('O1/RacingFrame'));
    });
    it('FR-5.3 the cascade holds all fields of RacingFrame and of both instances', () => {
        const p = planDelete(bc1(), buildIndex(bc1()), [id('O1/RacingFrame')]) as DeletePlan;
        expect(p.cascade).toEqual(expect.arrayContaining([id('O1/RacingFrame/material'), id('O2/RocketA1XL/weight'), id('O3/Frame134123/serialNumber')]));
        expect(p.summary.fields).toBe(6 + 6 + 1);
    });
    it('deleting an attribute cascades to its instance fields', () => expect((planDelete(bc1(), buildIndex(bc1()), [id('O1/RacingFrame/material')]) as DeletePlan).cascade).toContain(id('O2/RocketA1XL/material')));
    it('a level with another level typed by it is refused; the bottom level is not', () => {
        expect(planDelete(bc1(), buildIndex(bc1()), [id('O2')]).ok).toBe(false);
        expect(planDelete(bc1(), buildIndex(bc1()), [id('O3')]).ok).toBe(true);
    });
    it('deleting a level takes its enumerations', () => {
        const t = bc1({ onlyTop: true });
        const p = planDelete(t, buildIndex(t), [id('O0')]) as DeletePlan;
        expect(p.summary.enumerations).toBe(1);
        expect(p.cascade).toContain('enum/FrameMaterial');
    });
});
