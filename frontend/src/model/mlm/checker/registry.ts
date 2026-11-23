/**
 * Rule registry (architecture §4.4). Pure. Each rule file under ./rules exports a readonly RuleDef[];
 * RULES is their concatenation, ordered by rule number.
 */
import type { DeepIndex } from '../deepIndex';
import type { DeepModel, Id, Potency, RuleId } from '../types';
import type { Fix, Severity } from './records';
import { LEVEL_RULES } from './rules/levels';
import { TYPING_RULES } from './rules/typing';

export interface RuleContext { readonly model: DeepModel; readonly ix: DeepIndex; readonly pot: (x: Id) => Potency | null; }
export interface RawRecord { readonly element: Id; readonly related?: readonly Id[]; readonly params: Readonly<Record<string, string | number>>; readonly variant?: string; readonly severity?: Severity; readonly fix?: Fix; }
export interface RuleDef {
    readonly id: RuleId;
    readonly severity: Severity;                     // default; a rule with two cases (WF-19) sets it per record
    readonly increment: 1 | 2;
    readonly checks: readonly string[];              // R-ids, from spec §4
    readonly templates: Readonly<Record<string, string>>; // variant -> template; 'default' always present
    evaluate(ctx: RuleContext): Iterable<RawRecord>;
}

/** Every rule id of spec §4 (WF-1 ... WF-23); the ones without a RuleDef are reported as not evaluated. */
export const KNOWN_RULE_IDS: readonly RuleId[] = Array.from({ length: 23 }, (_, i) => `WF-${i + 1}` as RuleId);

export const ruleNumber = (id: RuleId): number => Number(id.slice(3));

/**
 * Placeholder for a rule whose file does not exist yet (brief S2 point 5). It returns nothing, which
 * spec §5 reads as "checked and satisfied", so every placeholder must be gone by the end of Task 11.
 */
const placeholder = (id: RuleId): RuleDef => ({ id, severity: 'error', increment: 1, checks: [], templates: { default: '' }, evaluate: () => [] });

const IMPLEMENTED: readonly RuleDef[] = [...LEVEL_RULES, ...TYPING_RULES];

export const RULES: readonly RuleDef[] = [
    ...IMPLEMENTED,
    ...KNOWN_RULE_IDS.slice(0, 18).filter((id) => !IMPLEMENTED.some((r) => r.id === id)).map(placeholder),
].sort((a, b) => ruleNumber(a.id) - ruleNumber(b.id));

/** The ids of the registered rules of that increment and below, by rule number. */
export function evaluatedRuleIds(increment: 1 | 2): readonly RuleId[] {
    return RULES.filter((r) => r.increment <= increment).map((r) => r.id);
}
