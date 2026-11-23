/**
 * Level rules WF-1, WF-2, WF-3 (spec mlm-concepts §4; R-LVL-1, R-LVL-2, R-LVL-4). Pure.
 * Choices (S2): WF-2 reports a dangling type id like a non-Model type; in a Model typing cycle every
 * Model on the cycle gets WF-2. WF-3 skips a Model whose typing is WF-2's case (no single Model type),
 * whose type's level is empty, or whose type has depth 0 (WF-6's case: its start and end mean nothing,
 * R-POT-2); an empty stored level is shown as {stored} = 'none'. A type without potency allows exactly
 * one level below it (R-INST-6).
 */
import { orderedIds } from '../../deepIndex';
import type { DeepLevel, DeepModel, Id } from '../../types';
import type { RawRecord, RuleContext, RuleDef } from '../registry';

const levelsOf = (m: DeepModel): DeepLevel[] => orderedIds(m).map((x) => m.elements.get(x)!).filter((e): e is DeepLevel => e.cls === 'Model');

/** True when M is reachable from itself through the `types` of Models (cycle-safe). */
function onTypingCycle(m: DeepModel, M: Id): boolean {
    const seen = new Set<Id>();
    const queue: Id[] = [...(m.elements.get(M)?.types ?? [])];
    for (let i = 0; i < queue.length; i++) {
        const x = queue[i];
        if (x === M) return true;
        if (seen.has(x)) continue;
        seen.add(x);
        const e = m.elements.get(x);
        if (e?.cls === 'Model') queue.push(...e.types);
    }
    return false;
}

const WF1: RuleDef = {
    id: 'WF-1', severity: 'error', increment: 1, checks: ['R-LVL-1'],
    templates: { default: "{kind} '{name}' belongs to {n} levels; it must belong to exactly one." },
    *evaluate({ model: m, ix }: RuleContext): Iterable<RawRecord> {
        for (const x of orderedIds(m)) {
            const e = m.elements.get(x)!;
            if (e.cls !== 'Clabject') continue;
            const ms = ix.memberOf.get(x) ?? [];
            if (ms.length !== 1) yield { element: x, related: ms, params: { kind: e.cls, name: e.name, n: ms.length } };
        }
    },
};

const WF2: RuleDef = {
    id: 'WF-2', severity: 'error', increment: 1, checks: ['R-LVL-2'],
    templates: { default: "Level '{name}' must be an instance of exactly one level above it." },
    *evaluate({ model: m }: RuleContext): Iterable<RawRecord> {
        for (const M of levelsOf(m)) {
            if (M.types.length === 0) continue; // a top level
            const single = M.types.length === 1 && m.elements.get(M.types[0])?.cls === 'Model';
            if (!single || onTypingCycle(m, M.id)) yield { element: M.id, related: M.types, params: { name: M.name } };
        }
    },
};

const WF3: RuleDef = {
    id: 'WF-3', severity: 'error', increment: 1, checks: ['R-LVL-2', 'R-LVL-4'],
    templates: {
        default: "Top level '{name}' must be numbered 0.",
        range: "Level '{name}' is numbered {stored}, but its type '{type}' allows only {lo} to {hi}.",
    },
    *evaluate({ model: m, pot }: RuleContext): Iterable<RawRecord> {
        for (const M of levelsOf(m)) {
            if (M.types.length === 0) {
                if (M.level !== 0) yield { element: M.id, params: { name: M.name } };
                continue;
            }
            if (M.types.length !== 1) continue;
            const T = m.elements.get(M.types[0]);
            if (T?.cls !== 'Model' || T.level == null) continue;
            const pt = pot(T.id);
            if (pt && pt.depth < 1) continue;
            const lo = T.level + (pt ? pt.start : 1), hi = T.level + (pt ? pt.end : 1);
            if (M.level == null || M.level < lo || M.level > hi) {
                yield { element: M.id, related: [T.id], variant: 'range', params: { name: M.name, stored: M.level ?? 'none', type: T.name, lo, hi } };
            }
        }
    },
};

export const LEVEL_RULES: readonly RuleDef[] = [WF1, WF2, WF3];
