import { describe, it, expect } from 'vitest';
import { buildIndex } from '../deepIndex';
import { domainProblem, effectivePotency, formatPotency, instancePotency, parsePotency, reach, storedState } from '../potency';
import { bc1, id, mutate, NONE } from './fixtures/bc1';

const m = bc1({ customer: true }), ix = buildIndex(m);

describe('potency', () => {
    it('own potency', () => expect(effectivePotency(m, ix, id('O0/Bicycle'))).toEqual({ start: 1, end: 1, depth: 3 }));
    it('FR-3.2: clabject without potency takes its Model\'s', () => {
        const n = mutate(m, (e) => { e.get(id('O0/Component')).pot = NONE; });
        expect(effectivePotency(n, buildIndex(n), id('O0/Component'))).toEqual({ start: 1, end: 1, depth: 3 });
    });
    it('FR-3.2: … or (1,1,1) when the Model has none', () => {
        const n = mutate(m, (e) => { e.get(id('O0')).pot = NONE; e.get(id('O0/Component')).pot = NONE; });
        expect(effectivePotency(n, buildIndex(n), id('O0/Component'))).toEqual({ start: 1, end: 1, depth: 1 });
    });
    it('FR-4.3: feature without potency takes its owner\'s', () => expect(effectivePotency(m, ix, id('O0/Customer/fullName'))).toEqual({ start: 3, end: 3, depth: 1 }));
    it('a Model without potency has no bound', () => {
        const n = mutate(m, (e) => { e.get(id('O0')).pot = NONE; });
        expect(effectivePotency(n, buildIndex(n), id('O0'))).toBeNull();
    });
    it('reach', () => { expect(reach({ start: 2, end: 2, depth: 3 })).toBe(4); expect(reach({ start: 1, end: 1, depth: 0 })).toBe(0); });
    it('instancePotency gives (1,1,0) at depth 1', () => expect(instancePotency({ start: 3, end: 3, depth: 1 })).toEqual({ start: 1, end: 1, depth: 0 }));
    it('storedState', () => { expect(storedState(NONE)).toBe('none'); expect(storedState({ start: 1, end: null, depth: null })).toBe('partial'); });
    it('domainProblem', () => {
        expect(domainProblem({ start: 2, end: 1, depth: 1 })).toMatch(/start/);
        expect(domainProblem({ start: 1, end: null, depth: null })).toMatch(/all three/);
        expect(domainProblem({ start: 1, end: 1, depth: 0 })).toBeNull();
        expect(domainProblem(NONE)).toBeNull();
    });
    it('format/parse', () => {
        expect(formatPotency({ start: 1, end: 2, depth: 1 })).toBe('1-2-1'); expect(formatPotency(NONE)).toBe('');
        expect(parsePotency('1-1-3')).toEqual({ start: 1, end: 1, depth: 3 }); expect(parsePotency('1 1 3')).toEqual({ start: 1, end: 1, depth: 3 });
        expect(parsePotency('')).toEqual(NONE); expect(parsePotency('1-x-3')).toBeNull();
    });
});
