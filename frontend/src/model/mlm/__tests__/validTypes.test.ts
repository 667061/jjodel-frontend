import { describe, it, expect } from 'vitest';
import { buildIndex } from '../deepIndex';
import { validTargetLevels, validTypesAt, type ValidType } from '../validTypes';
import { bc1, id, mutate } from './fixtures/bc1';

const m = bc1({ customer: true }), ix = buildIndex(m);
const names = (v: readonly ValidType[]) => v.map((t) => m.elements.get(t.typeId)!.name).sort();

describe('validTypes', () => {
    it('FR-6.7 palette of O2', () => expect(names(validTypesAt(m, ix, id('O2')))).toEqual(['RacingBike', 'RacingFrame']));
    it('FR-6.7 palette of O3', () => expect(names(validTypesAt(m, ix, id('O3')))).toEqual(['ChallengerA2XL', 'Customer', 'RocketA1XL']));
    it('FR-6.7 never d = 0, abstract or out of range', () => {
        const n = mutate(m, (e) => { e.get(id('O1/RacingFrame')).isAbstract = true; });
        expect(names(validTypesAt(n, buildIndex(n), id('O2')))).toEqual(['RacingBike']);
    });
    it('FR-6.8 Customer can go to O3 only', () => expect(validTargetLevels(m, ix, id('O0/Customer'))).toEqual([id('O3')]));
    it('distance is reported', () => expect(validTypesAt(m, ix, id('O3')).find((t) => t.typeId === id('O0/Customer'))!.distance).toBe(3));
});
