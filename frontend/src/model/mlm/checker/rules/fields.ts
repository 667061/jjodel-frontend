/**
 * Field rules WF-12 to WF-17 (spec mlm-concepts §4; R-INST-3, R-INST-4, R-FEAT-1, R-FEAT-2, R-INH-2). Pure.
 * Values are judged exactly as stored (Review Focus 4): WF-12 reports only null, so '' is a value that
 * WF-14 judges. Choices (S2), so that one fault gives one record:
 * - WF-12, WF-13 and WF-14 skip an attribute whose stored potency is WF-9's case.
 * - WF-14 checks every non-null value (brief S2 point 7) against a resolved data type; a missing or
 *   unresolved data type is not WF-14's fault. Variant typeMismatch compares data type ids with each
 *   type field's and is skipped when either side is missing or unresolved.
 * - WF-15 asks plannedFields (plans.ts) what an instance of each type t of y at dist(t, y) gets, and
 *   skips a type that is WF-4/5/6's case (not a clabject, d = 0, distance unknown or outside its range).
 *   A field counts as present when some feature in feats*(y) is typed by it.
 * - WF-16 (default): a typed field's type must be in feats*(a) for some a with instOf(owner, a) (typeClosure);
 *   a type of another class is WF-4's. Variant sharedType looks at the clabject's own features.
 * - WF-17 counts names over feats*(c), so a name clash with an inherited feature is reported on the sub.
 */
import { featsStar, orderedIds, typeClosure } from '../../deepIndex';
import type { DeepIndex } from '../../deepIndex';
import { distance } from '../../levels';
import { plannedFields } from '../../plans';
import { domainProblem } from '../../potency';
import type { DeepAttribute, DeepClabject, DeepElement, DeepModel, Id } from '../../types';
import { checkLexical } from '../../values';
import { displayName, ownerName } from '../records';
import type { RawRecord, RuleContext, RuleDef } from '../registry';

const isFeature = (e: DeepElement | undefined): boolean => e?.cls === 'Attribute' || e?.cls === 'Reference';
const attributes = (m: DeepModel): DeepAttribute[] => orderedIds(m).map((x) => m.elements.get(x)!).filter((e): e is DeepAttribute => e.cls === 'Attribute');
const clabjects = (m: DeepModel): DeepClabject[] => orderedIds(m).map((x) => m.elements.get(x)!).filter((e): e is DeepClabject => e.cls === 'Clabject');
/** Attributes with a usable effective potency (their stored potency is not WF-9's case). */
function* checkedAttributes({ model: m, pot }: RuleContext): Iterable<{ a: DeepAttribute; depth: number }> {
    for (const a of attributes(m)) {
        if (domainProblem(a.pot) != null) continue;
        const p = pot(a.id);
        if (p) yield { a, depth: p.depth };
    }
}

const WF12: RuleDef = {
    id: 'WF-12', severity: 'warning', increment: 1, checks: ['R-INST-4'],
    templates: { default: "Slot '{owner}.{name}' has no value." },
    *evaluate(ctx: RuleContext): Iterable<RawRecord> {
        for (const { a, depth } of checkedAttributes(ctx)) {
            if (depth === 0 && a.value === null) yield { element: a.id, params: { owner: ownerName(ctx.model, ctx.ix, a.id), name: a.name } };
        }
    },
};

const WF13: RuleDef = {
    id: 'WF-13', severity: 'warning', increment: 1, checks: ['R-FEAT-2'],
    templates: { default: "'{owner}.{name}' has a value but potency {d}; the value is ignored." },
    *evaluate(ctx: RuleContext): Iterable<RawRecord> {
        for (const { a, depth } of checkedAttributes(ctx)) {
            if (depth >= 1 && a.value !== null) yield { element: a.id, params: { owner: ownerName(ctx.model, ctx.ix, a.id), name: a.name, d: depth } };
        }
    },
};

const WF14: RuleDef = {
    id: 'WF-14', severity: 'error', increment: 1, checks: ['R-FEAT-2'],
    templates: {
        default: "'{value}' is not a valid {type} for '{owner}.{name}'.",
        typeMismatch: "'{owner}.{name}' has type {type}, but its type field '{f}' has type {expected}.",
    },
    *evaluate(ctx: RuleContext): Iterable<RawRecord> {
        const { model: m, ix } = ctx;
        for (const { a } of checkedAttributes(ctx)) {
            const dt = a.dataType;
            const owner = ownerName(m, ix, a.id);
            if (a.value !== null && dt && dt.kind !== 'unresolved' && !checkLexical(dt, a.value).ok) {
                yield { element: a.id, params: { value: a.value, type: dt.name, owner, name: a.name } };
            }
            if (!dt || dt.kind === 'unresolved') continue;
            for (const tid of a.types) {
                const t = m.elements.get(tid);
                if (t?.cls !== 'Attribute' || !t.dataType || t.dataType.kind === 'unresolved' || t.dataType.id === dt.id) continue;
                yield { element: a.id, related: [tid], variant: 'typeMismatch', params: { owner, name: a.name, type: dt.name, f: displayName(m, ix, tid), expected: t.dataType.name } };
            }
        }
    },
};

const WF15: RuleDef = {
    id: 'WF-15', severity: 'warning', increment: 1, checks: ['R-INST-3'],
    templates: { default: "'{name}' has no field for '{a}.{f}', which its type requires." },
    *evaluate({ model: m, ix, pot }: RuleContext): Iterable<RawRecord> {
        for (const y of clabjects(m)) {
            const present = new Set<Id>();
            for (const g of featsStar(m, ix, y.id)) for (const t of m.elements.get(g)!.types) present.add(t);
            const reported = new Set<Id>();
            for (const tid of y.types) {
                const t = m.elements.get(tid), pt = pot(tid), k = distance(m, ix, tid, y.id);
                if (t?.cls !== 'Clabject' || !pt || pt.depth < 1 || k == null || k < pt.start || k > pt.end) continue;
                for (const f of plannedFields(m, ix, tid, k)) {
                    if (present.has(f.typeOf) || reported.has(f.typeOf)) continue;
                    reported.add(f.typeOf);
                    yield { element: y.id, related: [f.typeOf], params: { name: y.name, a: ownerName(m, ix, f.typeOf), f: f.name } };
                }
            }
        }
    },
};

/** feats*(a) for every a with instOf(y, a), as one set; cached per clabject. */
function inheritedTypeFields(m: DeepModel, ix: DeepIndex, cache: Map<Id, Set<Id>>, y: Id): Set<Id> {
    let s = cache.get(y);
    if (!s) {
        s = new Set<Id>();
        for (const { type: a } of typeClosure(m, ix, y)) for (const f of featsStar(m, ix, a)) s.add(f);
        cache.set(y, s);
    }
    return s;
}

const WF16: RuleDef = {
    id: 'WF-16', severity: 'error', increment: 1, checks: ['R-INST-3'],
    templates: {
        default: "Field '{owner}.{name}' is typed by '{f}', which is not a field of a type of '{owner}'.",
        sharedType: "'{owner}' has {n} fields typed by '{f}'.",
    },
    *evaluate({ model: m, ix }: RuleContext): Iterable<RawRecord> {
        const cache = new Map<Id, Set<Id>>();
        for (const xid of orderedIds(m)) {
            const g = m.elements.get(xid)!;
            const y = ix.owner.get(xid);
            if (!isFeature(g) || y == null) continue;
            for (const tid of g.types) {
                const t = m.elements.get(tid);
                if (!t || t.cls !== g.cls) continue;
                if (!inheritedTypeFields(m, ix, cache, y).has(tid)) {
                    yield { element: g.id, related: [tid], params: { owner: m.elements.get(y)!.name, name: g.name, f: displayName(m, ix, tid) } };
                }
            }
        }
        for (const y of clabjects(m)) {
            const byType = new Map<Id, Id[]>();
            for (const g of y.features) {
                const ge = m.elements.get(g);
                if (!isFeature(ge)) continue;
                for (const t of new Set(ge!.types)) byType.set(t, [...(byType.get(t) ?? []), g]);
            }
            for (const [f, gs] of byType) {
                if (gs.length < 2) continue;
                yield { element: y.id, related: [...gs, f], variant: 'sharedType', params: { owner: y.name, n: gs.length, f: displayName(m, ix, f) } };
            }
        }
    },
};

const WF17: RuleDef = {
    id: 'WF-17', severity: 'error', increment: 1, checks: ['R-FEAT-1', 'R-INH-2'],
    templates: { default: "'{owner}' has {n} fields named '{name}'." },
    *evaluate({ model: m, ix }: RuleContext): Iterable<RawRecord> {
        for (const c of clabjects(m)) {
            const byName = new Map<string, Id[]>();
            for (const f of featsStar(m, ix, c.id)) { const n = m.elements.get(f)!.name; byName.set(n, [...(byName.get(n) ?? []), f]); }
            for (const [name, fs] of byName) if (fs.length > 1) yield { element: c.id, related: fs, params: { owner: c.name, n: fs.length, name } };
        }
    },
};

export const FIELD_RULES: readonly RuleDef[] = [WF12, WF13, WF14, WF15, WF16, WF17];
