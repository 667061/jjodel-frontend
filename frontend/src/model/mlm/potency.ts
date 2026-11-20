/**
 * Potency (architecture §4.2; spec mlm-concepts R-POT-1 ... R-POT-5). Pure.
 * A stored potency is all three ints or all three empty (0009 item 1); a d = 0 element stores (1, 1, 0).
 */
import type { DeepIndex } from './deepIndex';
import { modelOf } from './levels';
import type { DeepModel, Id, Potency, StoredPotency } from './types';

export type StoredState = 'none' | 'set' | 'partial';

const DEFAULT: Potency = { start: 1, end: 1, depth: 1 };

/** 'none' = all three empty, 'set' = all three filled, 'partial' = the WF-9 case (0009 item 1). */
export function storedState(p: StoredPotency): StoredState {
    const n = [p.start, p.end, p.depth].filter((v) => v == null).length;
    return n === 3 ? 'none' : n === 0 ? 'set' : 'partial';
}

/**
 * R-POT-4. Own potency when set; a partly filled one reads its empty parts as 1; with none, a
 * feature takes its owner's, a clabject its Model's, or (1, 1, 1) when the Model has none.
 * A Model with none sets no bound: null. An id not in the model: null.
 */
export function effectivePotency(m: DeepModel, ix: DeepIndex, x: Id): Potency | null {
    const seen = new Set<Id>();
    let cur: Id | null | undefined = x;
    while (cur != null && !seen.has(cur)) {
        seen.add(cur);
        const e = m.elements.get(cur);
        if (!e) return cur === x ? null : DEFAULT;
        const st = storedState(e.pot);
        if (st !== 'none') return { start: e.pot.start ?? 1, end: e.pot.end ?? 1, depth: e.pot.depth ?? 1 };
        if (e.cls === 'Model') return cur === x ? null : DEFAULT; // a clabject in a Model without potency: (1, 1, 1)
        cur = e.cls === 'Clabject' ? modelOf(m, ix, e.id) : (ix.owner.get(e.id) ?? e.container);
    }
    return DEFAULT;
}

/** reach = e + d - 1 if d >= 1, else 0 (spec §3.0). */
export function reach(p: Potency): number {
    return p.depth >= 1 ? p.end + p.depth - 1 : 0;
}

/** R-POT-3 and "all three or none" (WF-9's {reason}); null = fine. */
export function domainProblem(p: StoredPotency): string | null {
    const st = storedState(p);
    if (st === 'none') return null;
    if (st === 'partial') return 'start, end and depth must be all three set or all three empty';
    const { start, end, depth } = p as Potency;
    if (![start, end, depth].every(Number.isInteger)) return 'start, end and depth must be integers';
    if (depth < 0) return 'depth must not be negative';
    if (start < 0 || end < 0) return 'start and end must not be negative';
    if (depth >= 1 && start < 1) return 'start must be at least 1 when depth is at least 1';
    if (depth >= 1 && start > end) return 'start must not be greater than end';
    return null;
}

/** R-POT-5: a direct instance gets (1, 1, d - 1); d - 1 = 0 gives (1, 1, 0) (0009 item 1). */
export function instancePotency(typePot: Potency): Potency {
    return { start: 1, end: 1, depth: Math.max(0, typePot.depth - 1) };
}

/** Elias's notation s-e-d (0006): '1-1-3'; '' for none or null. A partial potency shows its empty parts as '?'. */
export function formatPotency(p: StoredPotency | Potency | null): string {
    if (p == null || storedState(p) === 'none') return '';
    return [p.start, p.end, p.depth].map((v) => (v == null ? '?' : String(v))).join('-');
}

/** '1-1-3' or '1 1 3' (any mix of '-', ',' and spaces between three non-negative ints); '' or blanks give none; anything else null. */
export function parsePotency(text: string): StoredPotency | null {
    const t = text.trim();
    if (t === '') return { start: null, end: null, depth: null };
    const parts = /^(\d+)\s*[-,\s]\s*(\d+)\s*[-,\s]\s*(\d+)$/.exec(t);
    if (!parts) return null;
    return { start: Number(parts[1]), end: Number(parts[2]), depth: Number(parts[3]) };
}
