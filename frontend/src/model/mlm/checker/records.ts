/**
 * Check records (architecture §4.4; spec mlm-concepts §5). Pure.
 * A record is identified by (rule, element, related); the checker fills `message` from the spec §4
 * template of its rule and never applies a `fix`.
 */
import type { DeepIndex } from '../deepIndex';
import type { DeepModel, Id, RuleId } from '../types';

export type Severity = 'error' | 'warning';
export type FixKind = 'setValue' | 'setPotency' | 'removeType' | 'addMissingFields' | 'moveToLevel' | 'renameField';
export interface Fix { readonly label: string; readonly kind: FixKind; readonly params: Readonly<Record<string, string | number | boolean | null>>; }
export interface CheckRecord {
    readonly rule: RuleId;             // traces to R-ids through spec §4
    readonly severity: Severity;
    readonly element: Id;              // "Reported on" in spec §4
    readonly related: readonly Id[];   // type, owner, Model ...; sorted; may be empty
    readonly params: Readonly<Record<string, string | number>>;
    readonly message: string;          // spec §4 template filled with params
    readonly fix?: Fix;                // a suggestion; never applied by the checker
}
export interface CheckReport {
    readonly records: readonly CheckRecord[];   // sorted by (rule, element, related)
    readonly evaluated: readonly RuleId[];      // FR-8.4: WF-1 ... WF-18 in increment 1
    readonly notEvaluated: readonly RuleId[];   // WF-19 ... WF-23 in increment 1
}

/** Spec §5 identity: `${rule}|${element}|${related}`, with a sorted copy of related (the record is not touched). */
export function recordKey(r: CheckRecord): string {
    return `${r.rule}|${r.element}|${[...r.related].sort().join(',')}`;
}

/** Fills each {key} with params[key]; a param named max with the value -1 is shown as '*' (spec §4). Unknown keys stay as written. */
export function formatMessage(template: string, params: Readonly<Record<string, string | number>>): string {
    return template.replace(/\{(\w+)\}/g, (whole, k: string) => {
        if (!Object.prototype.hasOwnProperty.call(params, k)) return whole;
        const v = params[k];
        return k === 'max' && v === -1 ? '*' : String(v);
    });
}

/**
 * The name a message shows for an element (brief S2 point 6): a feature as `Owner.name`, any other
 * element by its name, an id that is not in the model as the id itself.
 */
export function displayName(m: DeepModel, ix: DeepIndex, x: Id): string {
    const e = m.elements.get(x);
    if (!e) return x;
    if (e.cls === 'Attribute' || e.cls === 'Reference') {
        const o = ix.owner.get(x);
        const oe = o != null ? m.elements.get(o) : undefined;
        return oe ? `${oe.name}.${e.name}` : e.name;
    }
    return e.name;
}

/** The name of a feature's owner (for `{owner}` in a template); '' when the feature has none. */
export function ownerName(m: DeepModel, ix: DeepIndex, x: Id): string {
    const o = ix.owner.get(x);
    return (o != null ? m.elements.get(o)?.name : undefined) ?? '';
}
