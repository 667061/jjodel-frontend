/**
 * The MLM linguistic metamodel as data (architecture §3.1, after 0008 and 0009), after the multi-level
 * neutral metamodel of deLara2017. The S3 builder creates it with the L-API; classes and features are
 * looked up by name, because ids differ on every build (T2.1 §9). Pure: data only.
 * Not stored: `instances`, `owner`, `subs` (derived by deepIndex.ts). Potency slots have no default.
 */
export const MLM_LANGUAGE = 'mlm-deLara2017';
export const MLM_LANGUAGE_VERSION = 1;
export const MLM_MARKER_KEY = 'mlm';
export const MLM_TYPES_PACKAGE = 'mlmTypes';
export const MLM_LANGUAGE_NAME = 'MLM language';

export interface ClassSpec {
    name: string; abstract: boolean; extends: string[];
    attributes: { name: string; type: 'EInt' | 'EString' | 'EBoolean'; lower: 0 | 1 }[];
    references: { name: string; type: string; upper: 1 | -1; containment: boolean }[];
}

export const LANGUAGE_CLASSES: readonly ClassSpec[] = [
    { name: 'DeepElement', abstract: true, extends: [],
        attributes: [{ name: 'start', type: 'EInt', lower: 0 }, { name: 'end', type: 'EInt', lower: 0 }, { name: 'depth', type: 'EInt', lower: 0 }],
        references: [] },
    { name: 'TypedElement', abstract: true, extends: ['DeepElement'],
        attributes: [{ name: 'name', type: 'EString', lower: 1 }],
        references: [{ name: 'types', type: 'TypedElement', upper: -1, containment: false }] },
    { name: 'Model', abstract: false, extends: ['TypedElement'],
        attributes: [{ name: 'level', type: 'EInt', lower: 0 }],
        references: [{ name: 'elements', type: 'Clabject', upper: -1, containment: true }, { name: 'ownedEnumerations', type: 'EObject', upper: -1, containment: false }] },
    { name: 'ModelElement', abstract: true, extends: ['TypedElement'],
        attributes: [],
        references: [{ name: 'card', type: 'Cardinality', upper: -1, containment: true }] },             // increment 2
    { name: 'Cardinality', abstract: false, extends: ['DeepElement'],
        attributes: [{ name: 'min', type: 'EInt', lower: 0 }, { name: 'max', type: 'EInt', lower: 0 }],  // increment 2
        references: [] },
    { name: 'Clabject', abstract: false, extends: ['ModelElement'],
        attributes: [{ name: 'isAbstract', type: 'EBoolean', lower: 0 }, { name: 'isMultiType', type: 'EBoolean', lower: 0 }],
        references: [{ name: 'supers', type: 'Clabject', upper: -1, containment: false }, { name: 'features', type: 'Feature', upper: -1, containment: true }] },
    { name: 'Feature', abstract: true, extends: ['ModelElement'], attributes: [], references: [] },
    { name: 'Reference', abstract: false, extends: ['Feature'],
        attributes: [],
        references: [{ name: 'target', type: 'Clabject', upper: 1, containment: false }] },              // [0..1]; increment 2
    { name: 'Attribute', abstract: false, extends: ['Feature'],
        attributes: [{ name: 'value', type: 'EString', lower: 0 }],
        references: [{ name: 'type', type: 'EObject', upper: 1, containment: false }] },                 // a primitive classifier or a DEnumerator
];
