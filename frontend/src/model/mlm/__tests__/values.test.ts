import { describe, it, expect } from 'vitest';
import type { DataTypeRef } from '../types';
import { checkLexical, MLM_PRIMITIVES } from '../values';
import { bc1, id, PRIM } from './fixtures/bc1';

// Review Focus 4 and FR-4.6: the stored string is judged exactly (no trimming).
const dbl = { kind: 'primitive', id: PRIM.EDouble, name: 'EDouble' } as const;
const bool: DataTypeRef = { kind: 'primitive', id: PRIM.EBoolean, name: 'EBoolean' };
const date: DataTypeRef = { kind: 'primitive', id: PRIM.EDate, name: 'EDate' };
const prim = (name: string): DataTypeRef => ({ kind: 'primitive', id: `Pointer_${name.toUpperCase()}`, name });
const frameMaterial = (() => { const a = bc1().elements.get(id('O1/RacingFrame/material')); if (a?.cls !== 'Attribute' || !a.dataType) throw new Error('fixture'); return a.dataType; })();

describe('checkLexical', () => {
    it.each([['920.0', true], ['4999.00', true], ['920 gr', false], ['920,0', false], [' 920.0', false], ['', false]])('EDouble %j → %s', (v, ok) => expect(checkLexical(dbl, v).ok).toBe(ok));
    it.each([['true', true], ['false', true], ['TRUE', false], ['yes', false]])('EBoolean %j → %s', (v, ok) => expect(checkLexical(bool, v).ok).toBe(ok));
    // Jjodel's M1 value editor is <input type="date"> (Info.tsx:873), which writes ISO YYYY-MM-DD; Jjodel has no EDate parser (S1 Task 6 Step 2).
    it.each([['2017-09-19', true], ['19th of September', false], ['2017-9-19', false], ['2017-02-30', false], ['2017-09-19T10:00', false]])('EDate %j → %s', (v, ok) => expect(checkLexical(date, v).ok).toBe(ok));
    it('enum literal names only', () => { expect(checkLexical(frameMaterial, 'carbon').ok).toBe(true); expect(checkLexical(frameMaterial, 'carbn').ok).toBe(false); });
    it.each([['EInt', '42', true], ['EInt', '-7', true], ['EInt', '4.2', false], ['EInt', '2147483648', false], ['EByte', '127', true], ['EByte', '128', false],
        ['ELong', '9223372036854775807', true], ['ELong', '9223372036854775808', false], ['EChar', 'a', true], ['EChar', 'ab', false], ['EString', '', true], ['EFloat', '1e3', true]])(
        '%s %j → %s', (t, v, ok) => expect(checkLexical(prim(t), v).ok).toBe(ok));
    it('an unresolved data type is reported', () => expect(checkLexical({ kind: 'unresolved', id: 'Pointer_gone' }, 'x')).toEqual({ ok: false, reason: 'unknown data type' }));
    it('a refusal carries a reason', () => { const r = checkLexical(dbl, '920 gr'); expect(r.ok === false && r.reason.length > 0).toBe(true); });
    it('MLM_PRIMITIVES leaves out EVoid, Expression, Action', () => expect(MLM_PRIMITIVES).toEqual(['EString', 'EBoolean', 'EChar', 'EByte', 'EShort', 'EInt', 'ELong', 'EFloat', 'EDouble', 'EDate']));
});
