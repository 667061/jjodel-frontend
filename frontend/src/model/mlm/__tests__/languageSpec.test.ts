import { describe, it, expect } from 'vitest';
import { LANGUAGE_CLASSES, MLM_LANGUAGE, MLM_LANGUAGE_NAME, MLM_LANGUAGE_VERSION, MLM_MARKER_KEY, MLM_TYPES_PACKAGE, type ClassSpec } from '../languageSpec';
import { MLM_VIEWPOINT_NAME, MLM_VIEWS } from '../viewpointSpec';

const cls = (name: string): ClassSpec => LANGUAGE_CLASSES.find((c) => c.name === name)!;

describe('languageSpec (architecture §3.1)', () => {
    it('nine classes with the §3.1 names', () => expect(LANGUAGE_CLASSES.map((c) => c.name)).toEqual(['DeepElement', 'TypedElement', 'Model', 'ModelElement', 'Cardinality', 'Clabject', 'Feature', 'Reference', 'Attribute']));
    it('no stored opposites', () => {
        const refs = LANGUAGE_CLASSES.flatMap((c) => c.references.map((r) => r.name));
        for (const n of ['instances', 'owner', 'subs', 'enumerations']) expect(refs).not.toContain(n);
    });
    it('potency slots are nullable ints on DeepElement', () => expect(LANGUAGE_CLASSES[0].attributes).toEqual([{ name: 'start', type: 'EInt', lower: 0 }, { name: 'end', type: 'EInt', lower: 0 }, { name: 'depth', type: 'EInt', lower: 0 }]));
    it('Model has ownedEnumerations', () => expect(cls('Model').references.map((r) => r.name)).toEqual(['elements', 'ownedEnumerations']));
    it('abstract classes and the extends chain', () => {
        expect(LANGUAGE_CLASSES.filter((c) => c.abstract).map((c) => c.name)).toEqual(['DeepElement', 'TypedElement', 'ModelElement', 'Feature']);
        expect(Object.fromEntries(LANGUAGE_CLASSES.map((c) => [c.name, c.extends]))).toEqual({
            DeepElement: [], TypedElement: ['DeepElement'], Model: ['TypedElement'], ModelElement: ['TypedElement'], Cardinality: ['DeepElement'],
            Clabject: ['ModelElement'], Feature: ['ModelElement'], Reference: ['Feature'], Attribute: ['Feature'],
        });
    });
    it('10 attributes and 8 references, containment only for elements, card and features (§3.1 size)', () => {
        expect(LANGUAGE_CLASSES.flatMap((c) => c.attributes)).toHaveLength(10);
        const refs = LANGUAGE_CLASSES.flatMap((c) => c.references);
        expect(refs).toHaveLength(8);
        expect(refs.filter((r) => r.containment).map((r) => r.name)).toEqual(['elements', 'card', 'features']);
        expect(cls('Reference').references).toEqual([{ name: 'target', type: 'Clabject', upper: 1, containment: false }]);
    });
    it('marker constants', () => expect([MLM_LANGUAGE, MLM_LANGUAGE_VERSION, MLM_MARKER_KEY, MLM_TYPES_PACKAGE, MLM_LANGUAGE_NAME]).toEqual(['mlm-deLara2017', 1, 'mlm', 'mlmTypes', 'MLM language']));
});

describe('viewpointSpec (architecture §3.3, T2.3 views)', () => {
    it('one Model and one Clabject vertex, three Attribute rows and a hidden Attribute vertex', () => {
        expect(MLM_VIEWPOINT_NAME).toBe('MLM');
        expect(MLM_VIEWS.map((v) => [v.appliesTo, v.kind, v.priority ?? null, v.visible ?? true])).toEqual([
            ['Model', 'vertex', null, true], ['Clabject', 'vertex', null, true],
            ['Attribute', 'row', 2, true], ['Attribute', 'row', 1, true], ['Attribute', 'row', null, true], ['Attribute', 'vertex', null, false],
        ]);
    });
    it('the slot row is picked by depth = 0 and shows the value', () => {
        const slot = MLM_VIEWS[2].ir as { predicate: unknown; template: { from: string; expr?: string }[] };
        expect(slot.predicate).toEqual({ op: 'eq', left: '$depth.value', right: { kind: 'number', value: 0 } });
        expect(slot.template.at(-1)).toEqual({ from: 'path', expr: '$value.value' });
    });
});
