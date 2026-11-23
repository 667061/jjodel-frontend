import { describe, it, expect } from 'vitest';
import { buildIndex, typeClosure, instancesTransitive } from '../deepIndex';
import { bc1, id, mutate } from './fixtures/bc1';

describe('deepIndex', () => {
    it('derives owner from container', () => expect(buildIndex(bc1()).owner.get(id('O2/RocketA1XL/weight'))).toBe(id('O2/RocketA1XL')));
    it('derives instances from types', () => expect(buildIndex(bc1()).instances.get(id('O1/RacingFrame'))).toEqual([id('O2/RocketA1XL')]));
    it('lists level members', () => expect(buildIndex(bc1()).byLevel.get(2)).toEqual(expect.arrayContaining([id('O2/ChallengerA2XL'), id('O2/RocketA1XL')])));
    it('typeClosure of Frame134123 reaches Component at distance 3', () =>
        expect(typeClosure(bc1(), buildIndex(bc1()), id('O3/Frame134123'))).toContainEqual({ type: id('O0/Component'), distance: 3 }));
    it('instancesTransitive of RacingFrame', () =>
        expect([...instancesTransitive(bc1(), buildIndex(bc1()), id('O1/RacingFrame'))].sort()).toEqual([id('O2/RocketA1XL'), id('O3/Frame134123')].sort()));
    // Review Focus 1 and 2
    it('closures terminate on a types cycle', () => {
        const m = mutate(bc1(), (e) => { e.get(id('O1/RacingFrame')).types = [id('O3/Frame134123')]; });
        expect(() => typeClosure(m, buildIndex(m), id('O3/Frame134123'))).not.toThrow();
    });
    it('ignores dangling type ids', () => {
        const m = mutate(bc1(), (e) => { e.get(id('O2/RocketA1XL')).types = ['Pointer_gone']; });
        expect(typeClosure(m, buildIndex(m), id('O2/RocketA1XL'))).toEqual([]);
    });
});
