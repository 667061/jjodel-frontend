/**
 * Derived index and closures (architecture §4.2; spec mlm-concepts §3.0). Pure.
 * `owner`, `instances` and `subs` are never stored (0009 item 2); they are derived here from
 * `container`, `types` and `supers`. Every closure keeps a visited set and skips dangling ids
 * (Review Focus 1 and 2).
 */
import { distance } from './levels';
import type { DeepClabject, DeepElement, DeepModel, Id } from './types';

export interface DeepIndex {
    readonly owner: ReadonlyMap<Id, Id>;                 // feature → clabject (derived from container)
    readonly memberOf: ReadonlyMap<Id, readonly Id[]>;   // clabject → Models whose elements list it (WF-1)
    readonly instances: ReadonlyMap<Id, readonly Id[]>;  // t → direct instances (from types)
    readonly subs: ReadonlyMap<Id, readonly Id[]>;       // c → direct subs (from supers)
    readonly byLevel: ReadonlyMap<number, readonly Id[]>; // level → clabjects
}

/** Ids in read order: `order` first, then any element `order` misses; each once, only ids present in `elements`. */
export function orderedIds(m: DeepModel): Id[] {
    const out: Id[] = [];
    const seen = new Set<Id>();
    for (const x of m.order) if (!seen.has(x) && m.elements.has(x)) { seen.add(x); out.push(x); }
    for (const x of m.elements.keys()) if (!seen.has(x)) { seen.add(x); out.push(x); }
    return out;
}

const push = <K, V>(map: Map<K, V[]>, k: K, v: V) => { const l = map.get(k); if (l) { if (!l.includes(v)) l.push(v); } else map.set(k, [v]); };
const isClabject = (e: DeepElement | undefined): e is DeepClabject => e?.cls === 'Clabject';

export function buildIndex(m: DeepModel): DeepIndex {
    const owner = new Map<Id, Id>();
    const memberOf = new Map<Id, Id[]>();
    const instances = new Map<Id, Id[]>();
    const subs = new Map<Id, Id[]>();
    const byLevel = new Map<number, Id[]>();
    const ids = orderedIds(m);

    for (const x of ids) {
        const e = m.elements.get(x)!;
        if ((e.cls === 'Attribute' || e.cls === 'Reference') && e.container != null && isClabject(m.elements.get(e.container))) owner.set(x, e.container);
        if (e.cls === 'Model') for (const c of e.elements) if (m.elements.has(c)) push(memberOf, c, x);
        for (const t of e.types) if (m.elements.has(t)) push(instances, t, x);
        if (e.cls === 'Clabject') for (const s of e.supers) if (m.elements.has(s)) push(subs, s, x);
    }
    for (const x of ids) {
        const e = m.elements.get(x)!;
        if (e.cls !== 'Clabject') continue;
        const cont = e.container != null ? m.elements.get(e.container) : undefined;
        const model = cont?.cls === 'Model' ? cont : (() => { const mid = memberOf.get(x)?.[0]; const l = mid ? m.elements.get(mid) : undefined; return l?.cls === 'Model' ? l : undefined; })();
        if (model && model.level != null) push(byLevel, model.level, x);
    }
    return { owner, memberOf, instances, subs, byLevel };
}

/** Spec supers*(c): c itself and all its supers, transitively; cycle-safe, dangling ids skipped. */
export function supersStar(m: DeepModel, c: Id): readonly Id[] {
    if (!m.elements.has(c)) return [];
    const out: Id[] = [c];
    const seen = new Set<Id>(out);
    for (let i = 0; i < out.length; i++) {
        const e = m.elements.get(out[i]);
        if (!isClabject(e)) continue;
        for (const s of e.supers) if (!seen.has(s) && m.elements.has(s)) { seen.add(s); out.push(s); }
    }
    return out;
}

/** Spec feats*(c): the features of every clabject in supers*(c), own first, each in stored order; dangling ids skipped. */
export function featsStar(m: DeepModel, _ix: DeepIndex, c: Id): readonly Id[] {
    const out: Id[] = [];
    for (const s of supersStar(m, c)) {
        const e = m.elements.get(s);
        if (!isClabject(e)) continue;
        for (const f of e.features) if (m.elements.has(f) && !out.includes(f)) out.push(f);
    }
    return out;
}

/**
 * Every a with instOf(y, a) (spec §3.0), nearest first, each once. The distance is summed hop by
 * hop: one hop is dist(t, x) by stored levels, or 1 when a level is unknown, so in a well-formed
 * model it equals dist(a, y). Supers of a type share its hop (R-INH-1: same Model). y itself is
 * never listed, even in a types cycle; dangling ids are skipped.
 */
export function typeClosure(m: DeepModel, ix: DeepIndex, y: Id): ReadonlyArray<{ readonly type: Id; readonly distance: number }> {
    const out: { type: Id; distance: number }[] = [];
    const seen = new Set<Id>([y]);
    let frontier: { id: Id; d: number }[] = [{ id: y, d: 0 }];
    while (frontier.length) {
        const next: { id: Id; d: number }[] = [];
        for (const { id: x, d } of frontier) {
            const e = m.elements.get(x);
            if (!e) continue;
            for (const t of e.types) {
                if (!m.elements.has(t)) continue;
                const hop = distance(m, ix, t, x) ?? 1;
                for (const a of supersStar(m, t)) {
                    if (seen.has(a)) continue;
                    seen.add(a);
                    out.push({ type: a, distance: d + hop });
                    next.push({ id: a, d: d + hop });
                }
            }
        }
        frontier = next;
    }
    return out;
}

/** Every y with instOf(y, t): direct instances of t and of its subs, transitively (cascade set, FR-5.3); t excluded, cycle-safe. */
export function instancesTransitive(m: DeepModel, ix: DeepIndex, t: Id): readonly Id[] {
    const out: Id[] = [];
    const seen = new Set<Id>([t]);
    const queue: Id[] = [t];
    for (let i = 0; i < queue.length; i++) {
        // subs*(queue[i]): instances of a sub are instances of the super (R-INH-4)
        const subsStar: Id[] = [queue[i]];
        const subSeen = new Set<Id>(subsStar);
        for (let j = 0; j < subsStar.length; j++) for (const s of ix.subs.get(subsStar[j]) ?? []) if (!subSeen.has(s)) { subSeen.add(s); subsStar.push(s); }
        for (const s of subsStar) for (const y of ix.instances.get(s) ?? []) {
            if (seen.has(y)) continue;
            seen.add(y);
            out.push(y);
            queue.push(y);
        }
    }
    return out;
}
