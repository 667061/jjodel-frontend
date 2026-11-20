/**
 * Planners (architecture §4.3; spec R-INST-1 ... R-INST-6). Pure: each planner reads a DeepModel and
 * returns a plan or a Refusal; the shell's executor carries a plan out. A planner refuses only what
 * makes the operation impossible or nonsensical; everything else is the checker's job (0002 choice 4).
 */
import type { DeepIndex } from './deepIndex';
import { featsStar, instancesTransitive, orderedIds, typeClosure } from './deepIndex';
import { levelOf } from './levels';
import { effectivePotency, instancePotency } from './potency';
import type { DeepModel, Id, MlmClass, Potency, StoredPotency } from './types';
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
export interface AddLevelPlan { readonly ok: true; readonly kind: 'addLevel'; readonly typeModelId: Id; readonly name: string; readonly level: number; readonly pot: Potency | null; readonly needs: PreflightNeeds; }
export interface AddAttributePlan { readonly ok: true; readonly kind: 'addAttribute'; readonly ownerId: Id; readonly name: string; readonly dataType: Id; readonly pot: StoredPotency; readonly needs: PreflightNeeds; }
export interface AddEnumerationPlan { readonly ok: true; readonly kind: 'addEnumeration'; readonly levelId: Id; readonly name: string; readonly literals: readonly string[]; }
export interface DeletePlan { readonly ok: true; readonly kind: 'delete'; readonly requested: readonly Id[]; readonly cascade: readonly Id[]; readonly order: readonly Id[]; readonly summary: { readonly instances: number; readonly fields: number; readonly enumerations: number }; }

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

/**
 * R-INST-6 with k = 1 (increment 1): the new Model is typed by typeModelId, on level lv(M) + 1, with
 * potency (1, 1, d(M) - 1), or no potency when M has none. Refuses a Model with d = 0 (FR-2.2), a
 * Model whose range excludes k = 1, an unset level, an empty or taken name. Default name: 'O<level>'.
 */
export function planAddLevel(m: DeepModel, ix: DeepIndex, req: { typeModelId: Id; name?: string }): AddLevelPlan | Refusal {
    const t = m.elements.get(req.typeModelId);
    if (!t || t.cls !== 'Model') return refuse('R-INST-6', `'${t?.name ?? req.typeModelId}' is not a level (R-INST-6)`);
    if (t.level == null) return refuse('R-LVL-4', `The level of '${t.name}' is not set (R-INST-6, R-LVL-4)`);
    const pot = effectivePotency(m, ix, t.id);
    if (pot && pot.depth < 1) return refuse('R-INST-6', `'${t.name}' has depth 0, so no level can be added below it (R-INST-6, R-POT-2)`);
    if (pot && (1 < pot.start || 1 > pot.end)) return refuse('R-INST-6', `'${t.name}' can be instantiated only ${pot.start} to ${pot.end} level(s) below, not 1 (R-INST-6, R-POT-2)`);
    const level = t.level + 1;
    const taken = new Set([...m.elements.values()].filter((e) => e.cls === 'Model').map((e) => e.name));
    let name = req.name;
    if (name === undefined) { name = `O${level}`; for (let i = 2; taken.has(name); i++) name = `O${level}_${i}`; }
    if (name === '') return refuse('R-INST-6', `A new level needs a name (R-INST-6)`);
    if (taken.has(name)) return refuse('R-INST-6', `A level named '${name}' already exists (R-INST-6)`);
    return {
        ok: true, kind: 'addLevel', typeModelId: t.id, name, level, pot: pot ? instancePotency(pot) : null,
        needs: { metaclasses: ['Model'], freeNames: [{ containerId: m.modelId, names: [name] }], existingIds: [t.id] },
    };
}

/** R-INST-5: an untyped attribute with its own (optional) potency on any clabject. A duplicate name is allowed (WF-17 reports it); a bad potency is WF-9's. */
export function planAddAttribute(m: DeepModel, _ix: DeepIndex, req: { ownerId: Id; name: string; dataType: Id; pot?: StoredPotency }): AddAttributePlan | Refusal {
    const owner = m.elements.get(req.ownerId);
    if (!owner || owner.cls !== 'Clabject') return refuse('R-INST-5', `'${owner?.name ?? req.ownerId}' is not a clabject (R-INST-5)`);
    if (req.name === '') return refuse('R-INST-5', `A new attribute needs a name (R-INST-5)`);
    if (req.dataType === '') return refuse('R-FEAT-2', `A new attribute needs a data type (R-FEAT-2)`);
    return {
        ok: true, kind: 'addAttribute', ownerId: owner.id, name: req.name, dataType: req.dataType,
        pot: req.pot ?? { start: null, end: null, depth: null },
        needs: { metaclasses: ['Attribute'], freeNames: [], existingIds: [owner.id, req.dataType] },
    };
}

/** E1 (0008): an enumeration on a level. Refuses an empty name, a name already used by an enumeration of that level, no literals, an empty or a duplicate literal. */
export function planAddEnumeration(m: DeepModel, _ix: DeepIndex, req: { levelId: Id; name: string; literals: readonly string[] }): AddEnumerationPlan | Refusal {
    const lv = m.elements.get(req.levelId);
    if (!lv || lv.cls !== 'Model') return refuse('R-FEAT-2', `'${lv?.name ?? req.levelId}' is not a level (R-FEAT-2)`);
    if (req.name === '') return refuse('R-FEAT-2', `A new enumeration needs a name (R-FEAT-2)`);
    const names = lv.ownedEnumerations.map((x) => m.enumerations?.get(x)).map((d) => (d && d.kind !== 'unresolved' ? d.name : null));
    if (names.includes(req.name)) return refuse('R-FEAT-2', `'${lv.name}' already has an enumeration named '${req.name}' (R-FEAT-2)`);
    if (req.literals.length === 0) return refuse('R-FEAT-2', `Enumeration '${req.name}' needs at least one literal (R-FEAT-2)`);
    if (req.literals.some((l) => l === '')) return refuse('R-FEAT-2', `Enumeration '${req.name}' has an empty literal (R-FEAT-2)`);
    const dup = req.literals.find((l, i) => req.literals.indexOf(l) !== i);
    if (dup !== undefined) return refuse('R-FEAT-2', `Enumeration '${req.name}' has the literal '${dup}' twice (R-FEAT-2)`);
    return { ok: true, kind: 'addEnumeration', levelId: lv.id, name: req.name, literals: [...req.literals] };
}

/**
 * FR-5.3 and architecture §4.3: the requested elements plus, to a fixpoint, the transitive instances of
 * every deleted clabject or feature, the features of every deleted clabject, and the clabjects and
 * ownedEnumerations of every deleted level. Refuses a level that a level outside the request is typed by
 * (levels go bottom-up), and an id not in the model. `order` deletes the deepest level first (features
 * before their clabjects, enumerations before their level) and the requested elements last.
 * summary.instances counts the clabjects in the cascade.
 */
export function planDelete(m: DeepModel, ix: DeepIndex, ids: readonly Id[]): DeletePlan | Refusal {
    const requested = uniq(ids);
    const enumLevel = new Map<Id, number | null>();
    for (const x of requested) {
        const e = m.elements.get(x);
        if (!e) return refuse('R-LVL-1', `'${x}' is not in the deep model and cannot be deleted (R-LVL-1)`);
        if (e.cls === 'Model') {
            const below = [...m.elements.values()].find((o) => o.cls === 'Model' && o.types.includes(x) && !requested.includes(o.id));
            if (below) return refuse('R-LVL-2', `Level '${e.name}' cannot be deleted while level '${below.name}' is typed by it; delete '${below.name}' first (R-LVL-2)`);
        }
    }
    const all = new Set<Id>(requested);
    const queue = [...requested];
    const add = (x: Id) => { if (!all.has(x)) { all.add(x); queue.push(x); } };
    for (let i = 0; i < queue.length; i++) {
        const x = queue[i];
        const e = m.elements.get(x);
        if (!e) continue; // an enumeration id
        if (e.cls === 'Model') {
            for (const c of e.elements) if (m.elements.has(c)) add(c);
            for (const en of e.ownedEnumerations) { enumLevel.set(en, e.level); add(en); }
            continue;
        }
        for (const y of instancesTransitive(m, ix, x)) add(y);
        if (e.cls === 'Clabject') for (const f of e.features) if (m.elements.has(f)) add(f);
    }
    const pos = new Map(orderedIds(m).map((x, i) => [x, i] as const));
    const rank = (x: Id): [number, number, number] => {
        const e = m.elements.get(x);
        const kind = !e ? 2 : e.cls === 'Attribute' || e.cls === 'Reference' ? 0 : e.cls === 'Clabject' ? 1 : 3;
        const lv = e ? levelOf(m, ix, x) : (enumLevel.get(x) ?? null);
        return [-(lv ?? -1), kind, pos.get(x) ?? Number.MAX_SAFE_INTEGER];
    };
    const byRank = (a: Id, b: Id) => { const ra = rank(a), rb = rank(b); return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2] || (a < b ? -1 : a > b ? 1 : 0); };
    const cascade = [...all].filter((x) => !requested.includes(x)).sort(byRank);
    const order = [...cascade, ...[...requested].sort(byRank)];
    const cls = (x: Id) => m.elements.get(x)?.cls;
    return {
        ok: true, kind: 'delete', requested, cascade, order,
        summary: {
            instances: cascade.filter((x) => cls(x) === 'Clabject').length,
            fields: cascade.filter((x) => cls(x) === 'Attribute' || cls(x) === 'Reference').length,
            enumerations: cascade.filter((x) => !m.elements.has(x)).length,
        },
    };
}
