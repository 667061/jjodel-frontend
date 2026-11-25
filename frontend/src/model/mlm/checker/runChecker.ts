/**
 * The well-formedness checker (architecture §4.4; spec mlm-concepts §4 and §5). Pure: it builds the
 * index once, runs every registered rule, fills severity and message, and returns the records sorted
 * by (rule, element, related). It never writes to the model and never applies a fix.
 */
import { buildIndex } from '../deepIndex';
import { effectivePotency } from '../potency';
import type { DeepModel, Id, Potency, RuleId } from '../types';
import { formatMessage, type CheckRecord, type CheckReport } from './records';
import { KNOWN_RULE_IDS, RULES, ruleNumber, type RuleContext } from './registry';

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function runChecker(m: DeepModel, opts?: { readonly increment?: 1 | 2; readonly only?: readonly RuleId[] }): CheckReport {
    const increment = opts?.increment ?? 1;
    const rules = RULES.filter((r) => r.increment <= increment && (!opts?.only || opts.only.includes(r.id)));
    const ix = buildIndex(m);
    const potCache = new Map<Id, Potency | null>();
    const pot = (x: Id): Potency | null => {
        if (!potCache.has(x)) potCache.set(x, effectivePotency(m, ix, x));
        return potCache.get(x)!;
    };
    const ctx: RuleContext = { model: m, ix, pot };

    const records: CheckRecord[] = [];
    for (const rule of rules) {
        for (const raw of rule.evaluate(ctx)) {
            const variant = raw.variant ?? 'default';
            const template = rule.templates[variant];
            if (template === undefined) throw new Error(`${rule.id} has no template '${variant}'`);
            records.push({
                rule: rule.id,
                severity: raw.severity ?? rule.severity,
                element: raw.element,
                related: [...(raw.related ?? [])].sort(),
                params: raw.params,
                message: formatMessage(template, raw.params),
                ...(raw.fix ? { fix: raw.fix } : {}),
            });
        }
    }
    records.sort((a, b) => ruleNumber(a.rule) - ruleNumber(b.rule) || cmp(a.element, b.element) || cmp(a.related.join(','), b.related.join(',')));

    const evaluated = rules.map((r) => r.id);
    return { records, evaluated, notEvaluated: KNOWN_RULE_IDS.filter((x) => !evaluated.includes(x)) };
}
