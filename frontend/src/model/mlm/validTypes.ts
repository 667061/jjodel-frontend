/**
 * Valid types per level and target levels (architecture §4.3; spec R-INST-1, R-POT-7; FR-6.7, FR-6.8). Pure.
 */
import type { DeepIndex } from './deepIndex';
import { orderedIds } from './deepIndex';
import { ancestors, levelOf, levelsInOrder, modelOf } from './levels';
import { effectivePotency, instancePotency, reach } from './potency';
import type { DeepModel, Id, Potency } from './types';

export interface ValidType { readonly typeId: Id; readonly distance: number; }

/** Result of the R-INST-1 / R-POT-7 preconditions; the refusal message names its rules (architecture §4.3). */
export type Instantiability =
    | { readonly ok: true; readonly distance: number; readonly typePot: Potency }
    | { readonly ok: false; readonly rule: string; readonly message: string };

/** R-INST-1 (non-abstract Clabject, d >= 1, model(t) in anc(M'), k in [s..e]) and R-POT-7 (reach of the new instance within the target Model's). */
export function checkInstantiable(m: DeepModel, ix: DeepIndex, typeId: Id, targetModelId: Id): Instantiability {
    const t = m.elements.get(typeId);
    if (!t || t.cls !== 'Clabject') return { ok: false, rule: 'R-INST-1', message: `'${t?.name ?? typeId}' is not a clabject and cannot be instantiated (R-INST-1)` };
    const target = m.elements.get(targetModelId);
    if (!target || target.cls !== 'Model') return { ok: false, rule: 'R-INST-1', message: `'${target?.name ?? targetModelId}' is not a level (R-INST-1)` };
    if (t.isAbstract === true) return { ok: false, rule: 'R-INST-1', message: `'${t.name}' is abstract and cannot be instantiated (R-INST-1, R-INH-5)` };
    const pot = effectivePotency(m, ix, typeId)!;
    if (pot.depth < 1) return { ok: false, rule: 'R-INST-1', message: `'${t.name}' has depth 0 and cannot be instantiated (R-INST-1, R-POT-2)` };
    const lt = levelOf(m, ix, typeId), lm = target.level;
    if (lt == null || lm == null) return { ok: false, rule: 'R-INST-1', message: `The level of '${t.name}' or of '${target.name}' is not set (R-INST-1, R-LVL-4)` };
    const typeModel = modelOf(m, ix, typeId);
    if (typeModel == null || !ancestors(m, targetModelId).includes(typeModel)) {
        return { ok: false, rule: 'R-INST-1', message: `'${target.name}' is not a level below '${t.name}' (R-INST-1, R-TYP-3)` };
    }
    const k = lm - lt;
    if (k < pot.start || k > pot.end) {
        return { ok: false, rule: 'R-INST-1', message: `'${t.name}' can be instantiated only ${pot.start} to ${pot.end} level(s) below, not ${k} (R-INST-1, R-POT-2)` };
    }
    const bound = effectivePotency(m, ix, targetModelId);
    const r = reach(instancePotency(pot));
    if (bound && r > reach(bound)) {
        return { ok: false, rule: 'R-POT-7', message: `An instance of '${t.name}' would reach ${r} level(s) below '${target.name}', but '${target.name}' allows ${reach(bound)} (R-POT-7)` };
    }
    return { ok: true, distance: k, typePot: pot };
}

/** FR-6.7: the clabjects that may be instantiated on targetModelId, ordered by the type's level, then name. */
export function validTypesAt(m: DeepModel, ix: DeepIndex, targetModelId: Id): readonly ValidType[] {
    const out: { typeId: Id; distance: number; level: number; name: string }[] = [];
    for (const x of orderedIds(m)) {
        const e = m.elements.get(x)!;
        if (e.cls !== 'Clabject') continue;
        const r = checkInstantiable(m, ix, x, targetModelId);
        if (r.ok) out.push({ typeId: x, distance: r.distance, level: levelOf(m, ix, x)!, name: e.name });
    }
    out.sort((a, b) => a.level - b.level || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return out.map(({ typeId, distance }) => ({ typeId, distance }));
}

/** FR-6.8: the Models that validTypesAt would offer typeId on, in level order. */
export function validTargetLevels(m: DeepModel, ix: DeepIndex, typeId: Id): readonly Id[] {
    return levelsInOrder(m).filter((mid) => checkInstantiable(m, ix, typeId, mid).ok);
}
