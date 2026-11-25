import { describe, it, expect } from 'vitest';
import { buildIndex, typeClosure, instancesTransitive, supersStar, featsStar } from '../deepIndex';
import { planInstantiate } from '../plans';
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
    // S1 review carry-over (S2 Task 7a): a cycle in supers, Component <-> Bicycle
    describe('supers cycle Component <-> Bicycle', () => {
        const cyc = () => mutate(bc1(), (e) => { e.get(id('O0/Component')).supers = [id('O0/Bicycle')]; e.get(id('O0/Bicycle')).supers = [id('O0/Component')]; });
        it('supersStar terminates and lists each once', () => expect([...supersStar(cyc(), id('O0/Component'))].sort()).toEqual([id('O0/Bicycle'), id('O0/Component')]));
        it('featsStar terminates with the features of both, each once', () => {
            const m = cyc();
            const f = featsStar(m, buildIndex(m), id('O0/Component'));
            expect(f).toHaveLength(5);
            expect(new Set(f).size).toBe(5);
        });
        it('instancesTransitive terminates with every clabject below O0', () => {
            const m = cyc();
            expect([...instancesTransitive(m, buildIndex(m), id('O0/Component'))].sort()).toEqual(
                ['O1/RacingBike', 'O1/RacingFrame', 'O2/ChallengerA2XL', 'O2/RocketA1XL', 'O3/Bike134123', 'O3/Frame134123'].map(id).sort());
        });
        it('planInstantiate(Component -> O1) terminates and plans the fields of both', () => {
            const m = cyc();
            const p = planInstantiate(m, buildIndex(m), { typeId: id('O0/Component'), targetModelId: id('O1'), name: 'X' });
            expect(p.ok).toBe(true);
            if (p.ok) expect(p.fields.map((f) => f.name).sort()).toEqual(['regularSalesPrice', 'serialNumber', 'suitedForRace', 'suitedForToughTerrain', 'weight']);
        });
    });
    it('ignores dangling type ids', () => {
        const m = mutate(bc1(), (e) => { e.get(id('O2/RocketA1XL')).types = ['Pointer_gone']; });
        expect(typeClosure(m, buildIndex(m), id('O2/RocketA1XL'))).toEqual([]);
    });
});
