/**
 * Potency rules WF-9, WF-10, WF-11, WF-18 (spec mlm-concepts §4; R-POT-3, R-POT-5, R-POT-7, R-POT-8). Pure.
 * Choices (S2), so that one fault gives one record:
 * - WF-10, WF-11 and WF-18 skip an element whose own stored potency is WF-9's case.
 * - WF-10 skips a type of another class (WF-4), a type with d = 0 (WF-6) and a distance outside the
 *   type's range (WF-5, or WF-3 for a Model). Its {max} (a parameter spec §4 does not define) is the
 *   largest classic potency the type allows, (1, 1, min(d(t) - 1, reach(t) - dist(t, x))), written s-e-d
 *   as in {px}, e.g. '1-1-2'.
 * - WF-11 checks clabjects and features with a stored potency; a feature without one takes its owner's
 *   (R-POT-4), so the owner's record covers it.
 * - WF-18 takes {ro} as the largest reach of the owner and of all its specialisations (ix.subs, transitively).
 */
import { orderedIds } from '../../deepIndex';
import type { DeepIndex } from '../../deepIndex';
import { distance, modelOf } from '../../levels';
import { domainProblem, formatPotency, reach, storedState } from '../../potency';
import type { DeepElement, Id } from '../../types';
import { displayName } from '../records';
import type { RawRecord, RuleContext, RuleDef } from '../registry';

const elementsOf = (ctx: RuleContext): DeepElement[] => orderedIds(ctx.model).map((x) => ctx.model.elements.get(x)!);
const wf9Case = (e: DeepElement): boolean => domainProblem(e.pot) != null;

const WF9: RuleDef = {
    id: 'WF-9', severity: 'error', increment: 1, checks: ['R-POT-3'],
    templates: { default: "The potency of '{name}' is invalid: {reason}." },
    *evaluate(ctx: RuleContext): Iterable<RawRecord> {
        for (const e of elementsOf(ctx)) {
            const reason = domainProblem(e.pot);
            if (reason != null) yield { element: e.id, params: { name: displayName(ctx.model, ctx.ix, e.id), reason } };
        }
    },
};

const WF10: RuleDef = {
    id: 'WF-10', severity: 'error', increment: 1, checks: ['R-POT-5'],
    templates: { default: "'{name}' has potency {px}, more than its type '{type}' allows ({max})." },
    *evaluate(ctx: RuleContext): Iterable<RawRecord> {
        const { model: m, ix, pot } = ctx;
        for (const x of elementsOf(ctx)) {
            if (wf9Case(x)) continue;
            const px = pot(x.id);
            if (!px) continue;
            for (const tid of x.types) {
                const t = m.elements.get(tid);
                if (!t || t.cls !== x.cls) continue;
                const pt = pot(tid), k = distance(m, ix, tid, x.id);
                if (!pt || pt.depth < 1 || k == null || k < pt.start || k > pt.end) continue;
                if (px.depth < pt.depth && reach(px) + k <= reach(pt)) continue;
                const max = formatPotency({ start: 1, end: 1, depth: Math.min(pt.depth - 1, reach(pt) - k) });
                yield { element: x.id, related: [tid], params: { name: displayName(m, ix, x.id), px: formatPotency(px), type: displayName(m, ix, tid), max } };
            }
        }
    },
};

const WF11: RuleDef = {
    id: 'WF-11', severity: 'error', increment: 1, checks: ['R-POT-7'],
    templates: { default: "'{name}' reaches {r} level(s) down, but its level '{model}' allows only {rm}." },
    *evaluate(ctx: RuleContext): Iterable<RawRecord> {
        const { model: m, ix, pot } = ctx;
        for (const x of elementsOf(ctx)) {
            if (x.cls === 'Model' || wf9Case(x)) continue;
            if (x.cls !== 'Clabject' && storedState(x.pot) === 'none') continue;
            const mid = modelOf(m, ix, x.id);
            const pm = mid == null ? null : pot(mid), px = pot(x.id);
            if (!pm || !px || reach(px) <= reach(pm)) continue;
            yield { element: x.id, related: [mid!], params: { name: displayName(m, ix, x.id), r: reach(px), model: m.elements.get(mid!)!.name, rm: reach(pm) } };
        }
    },
};

/** The owner and all its subs, transitively (cycle-safe). */
function subsStar(ix: DeepIndex, c: Id): Id[] {
    const out = [c];
    for (let i = 0; i < out.length; i++) for (const s of ix.subs.get(out[i]) ?? []) if (!out.includes(s)) out.push(s);
    return out;
}

const WF18: RuleDef = {
    id: 'WF-18', severity: 'warning', increment: 1, checks: ['R-POT-8'],
    templates: { default: "Field '{owner}.{name}' reaches {rf} level(s) down, but '{owner}' and its specialisations reach only {ro}." },
    *evaluate(ctx: RuleContext): Iterable<RawRecord> {
        const { model: m, ix, pot } = ctx;
        for (const f of elementsOf(ctx)) {
            if ((f.cls !== 'Attribute' && f.cls !== 'Reference') || wf9Case(f)) continue;
            const owner = ix.owner.get(f.id), pf = pot(f.id);
            if (owner == null || !pf) continue;
            const ro = Math.max(...subsStar(ix, owner).map((c) => { const p = pot(c); return p ? reach(p) : 0; }));
            if (reach(pf) > ro) yield { element: f.id, related: [owner], params: { owner: m.elements.get(owner)!.name, name: f.name, rf: reach(pf), ro } };
        }
    },
};

export const POTENCY_RULES: readonly RuleDef[] = [WF9, WF10, WF11, WF18];
