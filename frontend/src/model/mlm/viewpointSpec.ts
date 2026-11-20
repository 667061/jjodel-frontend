/**
 * The default MLM viewpoint as data (architecture §3.3): T2.3's data-only IR views, copied from the spike
 * probe (thesis/reviews/assets/2026-11-13_spike-T2.3/t23_probe.ts.txt, CLABJECT, ATTR_ROWS, MODEL_FLAT;
 * the row type label is the run-2 form '$type.value'). The S3 builder adds irVersion, exclusive and the
 * metaclass pins when it creates each view. Pure: data only.
 */
export const MLM_VIEWPOINT_NAME = 'MLM';

export interface ViewSpec { appliesTo: 'Clabject' | 'Attribute' | 'Model'; kind: 'vertex' | 'row'; priority?: number; predicate?: string; visible?: boolean; ir: unknown }

const P = (expr: string) => ({ from: 'path', expr });
const Lit = (text: string) => ({ from: 'literal', text });
const when = (pred: unknown) => ({ when: pred, then: true, else: false });
const hasStart = { op: 'exists', path: '$start.value' };
const hasDepth = { op: 'exists', path: '$depth.value' };
const hasType = { op: 'exists', path: '$types.value' };

/** Potency badge s-e-d, shown only for an own (stored) potency. */
const potencyLabels = (position: string) => [
    { position, source: P('$start.value'), visible: when(hasStart), editable: false },
    { position, source: Lit('-'), visible: when(hasStart), editable: false },
    { position, source: P('$end.value'), visible: when(hasStart), editable: false },
    { position, source: Lit('-'), visible: when(hasStart), editable: false },
    { position, source: P('$depth.value'), visible: when(hasDepth), editable: false },
];

const CLABJECT = {
    kind: 'vertex', metaclasses: ['Clabject'], label: 'MLM clabject',
    shape: {
        form: 'rect', fill: '#ffffff',
        labels: [
            { position: 'top', source: P('$name.value'), editable: false },
            { position: 'top', source: Lit(' : '), visible: when(hasType), editable: false },
            { position: 'top', source: P('$types.value.$name.value'), visible: when(hasType), editable: false },
            ...potencyLabels('bottom'),
        ],
    },
    fieldCompartments: [{ id: 'fields', title: 'Fields', source: { from: 'children' }, rowFormat: { segments: [{ kind: 'name' }] }, separator: true }],
};

const ROW_BASE = [P('$name.value'), Lit(' : '), P('$type.value')];
const SLOT_PREDICATE = { op: 'eq', left: '$depth.value', right: { kind: 'number', value: 0 } };

const SLOT_ROW = { kind: 'row', metaclasses: ['Attribute'], label: 'slot row', priority: 2, predicate: SLOT_PREDICATE,
    template: [...ROW_BASE, Lit(' = '), P('$value.value')] };
const FIELD_ROW = { kind: 'row', metaclasses: ['Attribute'], label: 'field row', priority: 1, predicate: hasDepth,
    template: [...ROW_BASE, Lit('   '), P('$start.value'), Lit('-'), P('$end.value'), Lit('-'), P('$depth.value')] };
const INHERITED_ROW = { kind: 'row', metaclasses: ['Attribute'], label: 'field row (inherited potency)', template: ROW_BASE };
const ATTRIBUTE_HIDDEN = { kind: 'vertex', metaclasses: ['Attribute'], label: 'Attribute (not drawn)', visible: false, shape: { form: 'rect' } };

const MODEL = { kind: 'vertex', metaclasses: ['Model'], label: 'MLM level',
    shape: { form: 'rounded', fill: '#eef3fb', labels: [{ position: 'top', source: P('$name.value'), editable: false }, ...potencyLabels('bottom')] } };

export const MLM_VIEWS: readonly ViewSpec[] = [
    { appliesTo: 'Model', kind: 'vertex', ir: MODEL },
    { appliesTo: 'Clabject', kind: 'vertex', ir: CLABJECT },
    { appliesTo: 'Attribute', kind: 'row', priority: 2, predicate: '$depth.value == 0', ir: SLOT_ROW },      // a slot: name : type = value
    { appliesTo: 'Attribute', kind: 'row', priority: 1, predicate: 'exists $depth.value', ir: FIELD_ROW },  // own potency: name : type s-e-d
    { appliesTo: 'Attribute', kind: 'row', ir: INHERITED_ROW },                                             // no own potency (R-POT-4)
    { appliesTo: 'Attribute', kind: 'vertex', visible: false, ir: ATTRIBUTE_HIDDEN },                       // safety net: never a node
];
