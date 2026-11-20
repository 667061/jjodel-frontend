/**
 * Planners (architecture §4.3; spec R-INST-1 ... R-INST-6). Pure: each planner reads a DeepModel and
 * returns a plan or a Refusal; the shell's executor carries a plan out. A planner refuses only what
 * makes the operation impossible or nonsensical; everything else is the checker's job (0002 choice 4).
 */
import type { DeepIndex } from './deepIndex';
import { featsStar, typeClosure } from './deepIndex';
import { effectivePotency, instancePotency } from './potency';
import type { DeepModel, Id, MlmClass, Potency } from './types';
import { checkInstantiable } from './validTypes';

export interface Refusal { readonly ok: false; readonly rule: string; readonly message: string; } // rule = R- or WF-id
export interface PreflightNeeds {                    // what the executor checks against the host before creating
    readonly metaclasses: readonly MlmClass[];
    readonly freeNames: ReadonlyArray<{ readonly containerId: Id; readonly names: readonly string[] }>;
    readonly existingIds: readonly Id[];             // types, data types, containers that must exist
}
export interface PlannedField {
    readonly key: string; readonly cls: 'Attribute' | 'Reference'; readonly name: string;
    readonly typeOf: Id; readonly pot: Potency; readonly dataType: Id | null; readonly value?: string;
}
export interface InstantiatePlan {
    readonly ok: true; readonly kind: 'instantiate';
    readonly typeId: Id; readonly targetModelId: Id; readonly distance: number;
    readonly clabject: { readonly name: string; readonly types: readonly [Id]; readonly pot: Potency; readonly isAbstract: false; readonly isMultiType: false };
    readonly fields: readonly PlannedField[];        // R-INST-3, in feats* order
    readonly needs: PreflightNeeds;
}

const refuse = (rule: string, message: string): Refusal => ({ ok: false, rule, message });
const uniq = <T>(xs: readonly T[]): T[] => xs.filter((x, i) => xs.indexOf(x) === i);

/** Names of the elements a container lists (a Model's clabjects); used for "name already used in the target container". */
function namesIn(m: DeepModel, containerId: Id): string[] {
    const c = m.elements.get(containerId);
    const ids = c?.cls === 'Model' ? c.elements : c?.cls === 'Clabject' ? c.features : [];
    return ids.map((x) => m.elements.get(x)?.name).filter((n): n is string => n != null);
}

/**
 * R-INST-1 preconditions (via checkInstantiable, shared with validTypesAt), a non-empty name free in the
 * target Model; then R-INST-2 (the clabject) and R-INST-3 (its fields: for each a with instOf(y, a) at
 * distance k and each f in feats*(a) with d(f) >= 1 and k in [s(f)..e(f)]). A value given for a new
 * d = 0 field becomes its value (R-INST-4 leaves the rest empty). Two fields with one name refuse (WF-17).
 */
export function planInstantiate(m: DeepModel, ix: DeepIndex, req: { typeId: Id; targetModelId: Id; name: string; values?: Readonly<Record<string, string>> }): InstantiatePlan | Refusal {
    const ok = checkInstantiable(m, ix, req.typeId, req.targetModelId);
    if (!ok.ok) return refuse(ok.rule, ok.message);
    const target = m.elements.get(req.targetModelId)!;
    if (req.name === '') return refuse('R-INST-2', `A new clabject needs a name (R-INST-2)`);
    if (namesIn(m, req.targetModelId).includes(req.name)) return refuse('R-INST-2', `'${target.name}' already has an element named '${req.name}' (R-INST-2)`);

    // The new instance y: its own type at distance k, then that type's closure at k + its distance.
    const closure = [{ type: req.typeId, distance: ok.distance },
        ...typeClosure(m, ix, req.typeId).map((c) => ({ type: c.type, distance: c.distance + ok.distance }))];
    const fields: PlannedField[] = [];
    const seenF = new Set<Id>();
    for (const { type: a, distance: k } of closure) {
        for (const f of featsStar(m, ix, a)) {
            if (seenF.has(f)) continue;
            const fe = m.elements.get(f);
            if (!fe || (fe.cls !== 'Attribute' && fe.cls !== 'Reference')) continue;
            const fp = effectivePotency(m, ix, f);
            if (!fp || fp.depth < 1 || k < fp.start || k > fp.end) continue;
            seenF.add(f);
            const pot = instancePotency(fp);
            const value = pot.depth === 0 ? req.values?.[fe.name] : undefined;
            fields.push({
                key: f, cls: fe.cls, name: fe.name, typeOf: f, pot,
                dataType: fe.cls === 'Attribute' ? (fe.dataType?.id ?? null) : null,
                ...(value !== undefined ? { value } : {}),
            });
        }
    }
    const names = fields.map((f) => f.name);
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup !== undefined) return refuse('WF-17', `Instantiating '${m.elements.get(req.typeId)!.name}' would give '${req.name}' two fields named '${dup}' (WF-17)`);

    const needs: PreflightNeeds = {
        metaclasses: uniq<MlmClass>(['Clabject', ...fields.map((f) => f.cls)]),
        freeNames: [{ containerId: req.targetModelId, names: [req.name] }],
        existingIds: uniq([req.typeId, req.targetModelId, ...fields.map((f) => f.typeOf), ...fields.flatMap((f) => (f.dataType ? [f.dataType] : []))]),
    };
    return {
        ok: true, kind: 'instantiate', typeId: req.typeId, targetModelId: req.targetModelId, distance: ok.distance,
        clabject: { name: req.name, types: [req.typeId], pot: instancePotency(ok.typePot), isAbstract: false, isMultiType: false },
        fields, needs,
    };
}
