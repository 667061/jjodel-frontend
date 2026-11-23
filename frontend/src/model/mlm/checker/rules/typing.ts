/**
 * Typing rules WF-4 to WF-8 (spec mlm-concepts §4; R-TYP-2, R-TYP-3, R-TYP-4, R-POT-2, R-INH-5). Pure.
 * Every rule looks at each stored type t of an element x; a type id that is not in the model is skipped
 * (Review Focus 2). Choices (S2), so that one fault gives one record:
 * - WF-4, WF-5 and WF-8 skip Models: their typing is WF-2's (R-LVL-2; R-TYP-3 and R-TYP-4 leave Models to it).
 * - WF-5 skips a type of another class (WF-4's case) and an element or type with no Model (WF-1's case);
 *   its range variant skips a type with d = 0 (WF-6's case: start and end mean nothing, R-POT-2).
 *   WF-5 does not call checkInstantiable, which also checks abstractness, depth and R-POT-7 (brief S2).
 * - WF-8, OPEN-6 reading (b): several types are permitted only when every type is a direct instance
 *   (typedBy, spec §3.0) of a clabject with isMultiType = true.
 */
import { orderedIds, supersStar } from '../../deepIndex';
import { ancestors, distance, modelOf } from '../../levels';
import type { DeepElement, DeepModel, Id } from '../../types';
import { displayName } from '../records';
import type { RawRecord, RuleContext, RuleDef } from '../registry';

/** Each element with each of its stored types that is in the model. */
function* typed(m: DeepModel): Iterable<{ x: DeepElement; t: DeepElement }> {
    for (const xid of orderedIds(m)) {
        const x = m.elements.get(xid)!;
        for (const tid of x.types) {
            const t = m.elements.get(tid);
            if (t) yield { x, t };
        }
    }
}

const WF4: RuleDef = {
    id: 'WF-4', severity: 'error', increment: 1, checks: ['R-TYP-2'],
    templates: { default: "'{name}' is a {kind}, but its type '{type}' is a {typeKind}." },
    *evaluate({ model: m, ix }: RuleContext): Iterable<RawRecord> {
        for (const { x, t } of typed(m)) {
            if (x.cls === 'Model' || t.cls === x.cls) continue;
            yield { element: x.id, related: [t.id], params: { name: displayName(m, ix, x.id), kind: x.cls, type: displayName(m, ix, t.id), typeKind: t.cls } };
        }
    },
};

const WF5: RuleDef = {
    id: 'WF-5', severity: 'error', increment: 1, checks: ['R-TYP-3'],
    templates: {
        default: "'{type}' is not on a level above '{name}'.",
        range: "'{name}' is {k} level(s) below its type '{type}', which allows instances only {s} to {e} level(s) below.",
    },
    *evaluate({ model: m, ix, pot }: RuleContext): Iterable<RawRecord> {
        for (const { x, t } of typed(m)) {
            if (x.cls === 'Model' || t.cls !== x.cls) continue;
            const mx = modelOf(m, ix, x.id), mt = modelOf(m, ix, t.id);
            if (mx == null || mt == null) continue;
            const name = displayName(m, ix, x.id), type = displayName(m, ix, t.id);
            if (!ancestors(m, mx).includes(mt)) { yield { element: x.id, related: [t.id], params: { name, type } }; continue; }
            const k = distance(m, ix, t.id, x.id), pt = pot(t.id);
            if (k == null || pt == null || pt.depth < 1) continue;
            if (k < pt.start || k > pt.end) yield { element: x.id, related: [t.id], variant: 'range', params: { name, k, type, s: pt.start, e: pt.end } };
        }
    },
};

const WF6: RuleDef = {
    id: 'WF-6', severity: 'error', increment: 1, checks: ['R-POT-2'],
    templates: { default: "'{type}' has potency 0 and cannot have instances, but '{name}' is typed by it." },
    *evaluate({ model: m, ix, pot }: RuleContext): Iterable<RawRecord> {
        for (const { x, t } of typed(m)) {
            const pt = pot(t.id);
            if (pt && pt.depth < 1) yield { element: x.id, related: [t.id], params: { type: displayName(m, ix, t.id), name: displayName(m, ix, x.id) } };
        }
    },
};

const WF7: RuleDef = {
    id: 'WF-7', severity: 'error', increment: 1, checks: ['R-INH-5'],
    templates: { default: "'{type}' is abstract, but '{name}' is a direct instance of it." },
    *evaluate({ model: m }: RuleContext): Iterable<RawRecord> {
        for (const { x, t } of typed(m)) {
            if (x.cls === 'Clabject' && t.cls === 'Clabject' && t.isAbstract === true) yield { element: x.id, related: [t.id], params: { type: t.name, name: x.name } };
        }
    },
};

/** OPEN-6 (b): t is typedBy a clabject whose isMultiType is true. */
function permitsCoTyping(m: DeepModel, t: Id): boolean {
    const te = m.elements.get(t);
    if (!te) return false;
    return te.types.some((tp) => supersStar(m, tp).some((c) => { const ce = m.elements.get(c); return ce?.cls === 'Clabject' && ce.isMultiType === true; }));
}

const WF8: RuleDef = {
    id: 'WF-8', severity: 'error', increment: 1, checks: ['R-TYP-4'],
    templates: { default: "'{name}' has {n} types; multiple typing is not permitted here." },
    *evaluate({ model: m, ix }: RuleContext): Iterable<RawRecord> {
        for (const xid of orderedIds(m)) {
            const x = m.elements.get(xid)!;
            if (x.cls === 'Model' || x.types.length < 2) continue;
            if (!x.types.every((t) => permitsCoTyping(m, t))) yield { element: x.id, related: x.types, params: { name: displayName(m, ix, x.id), n: x.types.length } };
        }
    },
};

export const TYPING_RULES: readonly RuleDef[] = [WF4, WF5, WF6, WF7, WF8];
