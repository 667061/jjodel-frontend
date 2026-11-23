/**
 * Lexical value check (architecture §4.4; WF-14, R-FEAT-2, FR-4.6, Review Focus 4). Pure.
 * The stored string is judged exactly as stored: no trimming, only `true`/`false` for EBoolean,
 * `.` as the decimal separator. EDate is ISO YYYY-MM-DD, the form Jjodel's M1 value editor writes
 * (`<input type="date">`, components/editors/Info.tsx:873); Jjodel itself has no EDate parser
 * (the setter skips EDate, joiner/classes.ts:2478).
 */
import type { DataTypeRef } from './types';

export type LexicalResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** Jjodel's ShortAttribETypes (common/U.tsx:3326-3342) without EVoid, Expression and Action. */
export const MLM_PRIMITIVES: readonly string[] = ['EString', 'EBoolean', 'EChar', 'EByte', 'EShort', 'EInt', 'ELong', 'EFloat', 'EDouble', 'EDate'];

const OK: LexicalResult = { ok: true };
const no = (reason: string): LexicalResult => ({ ok: false, reason });

const INT = /^-?\d+$/;
const REAL = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const INT_BITS: Readonly<Record<string, bigint>> = { EByte: 8n, EShort: 16n, EInt: 32n, ELong: 64n };
const FLOAT_MAX = 3.4028234663852886e38;

function checkInt(type: string, v: string): LexicalResult {
    if (!INT.test(v)) return no('not an integer');
    const bits = INT_BITS[type];
    const n = BigInt(v), max = (1n << (bits - 1n)) - 1n, min = -(1n << (bits - 1n));
    return n < min || n > max ? no(`out of range for ${type} (${min} to ${max})`) : OK;
}

function checkDate(v: string): LexicalResult {
    const m = DATE.exec(v);
    if (!m) return no('not a date in the form YYYY-MM-DD');
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? OK : no('not a calendar date');
}

/** WF-14: does `value` parse as `dt`? An enum value must be one of its literal names (0008). */
export function checkLexical(dt: DataTypeRef, value: string): LexicalResult {
    if (dt.kind === 'unresolved') return no('unknown data type');
    if (dt.kind === 'enum') return dt.literals.includes(value) ? OK : no(`not a literal of ${dt.name} (${dt.literals.join(', ')})`);
    switch (dt.name) {
        case 'EString': return OK;
        case 'EBoolean': return value === 'true' || value === 'false' ? OK : no('not true or false');
        case 'EChar': return [...value].length === 1 ? OK : no('not exactly one character');
        case 'EByte': case 'EShort': case 'EInt': case 'ELong': return checkInt(dt.name, value);
        case 'EFloat': case 'EDouble': {
            if (!REAL.test(value)) return no('not a number with . as the decimal separator');
            const n = Number(value);
            if (!Number.isFinite(n) || (dt.name === 'EFloat' && Math.abs(n) > FLOAT_MAX)) return no(`out of range for ${dt.name}`);
            return OK;
        }
        case 'EDate': return checkDate(value);
        default: return no(`${dt.name} has no values`);
    }
}
