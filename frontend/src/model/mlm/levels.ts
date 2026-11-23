/**
 * Levels (architecture §4.2; spec mlm-concepts §3.0 and §3.1). Pure.
 * model(x), lv(x) = stored Model.level of model(x) (R-LVL-3, R-LVL-4), dist(t, x) = lv(x) - lv(t),
 * anc(M) (R-LVL-2, cycle-safe).
 */
import type { DeepIndex } from './deepIndex';
import type { DeepElement, DeepLevel, DeepModel, Id } from './types';

const isLevel = (e: DeepElement | undefined): e is DeepLevel => e?.cls === 'Model';

/** Spec model(x): a Model is its own; a clabject's is its container if that is a Model, else the first Model listing it; a feature's is its owner's. */
export function modelOf(m: DeepModel, ix: DeepIndex, x: Id): Id | null {
    const seen = new Set<Id>();
    let cur: Id | null | undefined = x;
    while (cur != null && !seen.has(cur)) {
        seen.add(cur);
        const e = m.elements.get(cur);
        if (!e) return null;
        if (e.cls === 'Model') return e.id;
        if (e.cls === 'Clabject') {
            if (e.container != null && isLevel(m.elements.get(e.container))) return e.container;
            return ix.memberOf.get(e.id)?.[0] ?? null;
        }
        cur = ix.owner.get(e.id) ?? e.container; // a feature: go to its owner
    }
    return null;
}

/** Stored Model.level of model(x) (R-LVL-4); null when x has no Model or the level is empty. */
export function levelOf(m: DeepModel, ix: DeepIndex, x: Id): number | null {
    const mid = modelOf(m, ix, x);
    const lv = mid == null ? undefined : m.elements.get(mid);
    return isLevel(lv) ? lv.level : null;
}

/** dist(t, x) = lv(x) - lv(t); null when either level is unknown. */
export function distance(m: DeepModel, ix: DeepIndex, t: Id, x: Id): number | null {
    const lt = levelOf(m, ix, t), lx = levelOf(m, ix, x);
    return lt == null || lx == null ? null : lx - lt;
}

/** anc(M): the Models above M through `types` (its type, its type's type, ...), nearest first; cycle-safe, dangling ids skipped, M itself excluded. */
export function ancestors(m: DeepModel, modelId: Id): readonly Id[] {
    const out: Id[] = [];
    const seen = new Set<Id>([modelId]);
    let frontier: Id[] = [modelId];
    while (frontier.length) {
        const next: Id[] = [];
        for (const cur of frontier) {
            const e = m.elements.get(cur);
            if (!isLevel(e)) continue;
            for (const t of e.types) {
                if (seen.has(t) || !isLevel(m.elements.get(t))) continue;
                seen.add(t);
                out.push(t);
                next.push(t);
            }
        }
        frontier = next;
    }
    return out;
}

/** All Models, by stored level (empty level last), then name, then id. */
export function levelsInOrder(m: DeepModel): readonly Id[] {
    const levels: DeepLevel[] = [];
    for (const e of m.elements.values()) if (isLevel(e)) levels.push(e);
    const key = (l: DeepLevel) => (l.level == null ? Number.POSITIVE_INFINITY : l.level);
    levels.sort((a, b) => key(a) - key(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return levels.map((l) => l.id);
}
