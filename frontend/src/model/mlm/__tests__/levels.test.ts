import { describe, it, expect } from 'vitest';
import { buildIndex } from '../deepIndex';
import { levelOf, distance, ancestors, levelsInOrder } from '../levels';
import { bc1, id, mutate } from './fixtures/bc1';

describe('levels', () => {
    it('levelOf a feature is its owner level', () => expect(levelOf(bc1(), buildIndex(bc1()), id('O3/Frame134123/serialNumber'))).toBe(3));
    it('distance Component → Frame134123 is 3', () => expect(distance(bc1(), buildIndex(bc1()), id('O0/Component'), id('O3/Frame134123'))).toBe(3));
    it('ancestors of O3', () => expect(ancestors(bc1(), id('O3'))).toEqual([id('O2'), id('O1'), id('O0')]));
    it('ancestors terminate on a Model cycle', () => {
        const m = mutate(bc1(), (e) => { e.get(id('O1')).types = [id('O3')]; });
        expect(() => ancestors(m, id('O3'))).not.toThrow();
    });
    it('levelsInOrder', () => expect(levelsInOrder(bc1())).toEqual([id('O0'), id('O1'), id('O2'), id('O3')]));
});
