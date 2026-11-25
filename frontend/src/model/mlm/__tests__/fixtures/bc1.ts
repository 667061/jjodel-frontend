/**
 * BC1 fixture: the MULTI 2018 Bicycle Challenge slice of thesis/specs/requirements.md §1.1,
 * as a plain-data DeepModel (architecture §4.1). Ids are readable paths ('O2/RocketA1XL/weight').
 * Every d = 0 row is stored as (1, 1, 0) (0008/0009 item 1).
 */
import { buildIndex } from '../../deepIndex';
import { planAddAttribute, planInstantiate, type AddAttributePlan, type InstantiatePlan } from '../../plans';
import type { DataTypeRef, DeepAttribute, DeepClabject, DeepElement, DeepLevel, DeepModel, Id, StoredPotency } from '../../types';

export function id(path: string): Id { return path; }

export const PRIM = {
    EString: 'Pointer_ESTRING',
    EDouble: 'Pointer_EDOUBLE',
    EBoolean: 'Pointer_EBOOLEAN',
    EDate: 'Pointer_EDATE',
} as const satisfies Record<string, Id>;

export const NONE: StoredPotency = { start: null, end: null, depth: null };

export const WF12_TEST_VALUES: Readonly<Record<string, string>> = {
    topTubeLength: '555.5', downTubeLength: '640.0', seatTubeLength: '520.25', material: 'carbon',
};

const prim = (name: keyof typeof PRIM): DataTypeRef => ({ kind: 'primitive', id: PRIM[name], name });
const FRAME_MATERIAL: DataTypeRef = { kind: 'enum', id: 'enum/FrameMaterial', name: 'FrameMaterial', literals: ['steel', 'aluminum', 'carbon'] };
const p = (start: number, end: number, depth: number): StoredPotency => ({ start, end, depth });

type Opts = { fieldLeap?: boolean; customer?: boolean; wf12Values?: boolean; clabjectsUpTo?: 0 | 1 | 2 | 3; onlyTop?: boolean };

/** Mutable builder rows; frozen into the DeepModel at the end. */
type Row =
    | { cls: 'Model'; id: Id; name: string; pot: StoredPotency; types: Id[]; level: number }
    | { cls: 'Clabject'; id: Id; name: string; pot: StoredPotency; types: Id[]; model: Id }
    | { cls: 'Attribute'; id: Id; name: string; pot: StoredPotency; types: Id[]; owner: Id; dataType: DataTypeRef; value: string | null };

function rows(o: Opts): Row[] {
    const r: Row[] = [];
    const level = (idv: Id, lv: number, types: Id[], pot: StoredPotency) => r.push({ cls: 'Model', id: idv, name: idv, pot, types, level: lv });
    const clab = (model: Id, name: string, types: Id[], pot: StoredPotency) => r.push({ cls: 'Clabject', id: `${model}/${name}`, name, pot, types, model });
    const attr = (owner: Id, name: string, dataType: DataTypeRef, types: Id[], pot: StoredPotency, value: string | null = null) =>
        r.push({ cls: 'Attribute', id: `${owner}/${name}`, name, pot, types, owner, dataType, value });

    level('O0', 0, [], p(1, 1, 3));
    level('O1', 1, ['O0'], p(1, 1, 2));
    level('O2', 2, ['O1'], p(1, 1, 1));
    level('O3', 3, ['O2'], p(1, 1, 0));

    // O0: generic types
    clab('O0', 'Bicycle', [], p(1, 1, 3));
    attr('O0/Bicycle', 'suitedForRace', prim('EBoolean'), [], p(1, 1, 1));
    attr('O0/Bicycle', 'suitedForToughTerrain', prim('EBoolean'), [], p(1, 1, 1));
    attr('O0/Bicycle', 'regularSalesPrice', prim('EDouble'), [], p(1, 1, 2));
    clab('O0', 'Component', [], p(1, 1, 3));
    attr('O0/Component', 'weight', prim('EDouble'), [], p(1, 1, 2));
    attr('O0/Component', 'serialNumber', prim('EString'), [], o.fieldLeap ? p(3, 3, 1) : p(1, 1, 3));
    if (o.customer) {
        clab('O0', 'Customer', [], p(3, 3, 1));
        attr('O0/Customer', 'fullName', prim('EString'), [], NONE);
    }

    // O1: categories
    clab('O1', 'RacingBike', ['O0/Bicycle'], p(1, 1, 2));
    attr('O1/RacingBike', 'suitedForRace', prim('EBoolean'), ['O0/Bicycle/suitedForRace'], p(1, 1, 0), 'true');
    attr('O1/RacingBike', 'suitedForToughTerrain', prim('EBoolean'), ['O0/Bicycle/suitedForToughTerrain'], p(1, 1, 0), 'false');
    attr('O1/RacingBike', 'regularSalesPrice', prim('EDouble'), ['O0/Bicycle/regularSalesPrice'], p(1, 1, 1));
    attr('O1/RacingBike', 'uciCertified', prim('EBoolean'), [], p(1, 1, 1));
    clab('O1', 'RacingFrame', ['O0/Component'], p(1, 1, 2));
    attr('O1/RacingFrame', 'weight', prim('EDouble'), ['O0/Component/weight'], p(1, 1, 1));
    if (!o.fieldLeap) attr('O1/RacingFrame', 'serialNumber', prim('EString'), ['O0/Component/serialNumber'], p(1, 1, 2));
    attr('O1/RacingFrame', 'topTubeLength', prim('EDouble'), [], p(1, 1, 1));
    attr('O1/RacingFrame', 'downTubeLength', prim('EDouble'), [], p(1, 1, 1));
    attr('O1/RacingFrame', 'seatTubeLength', prim('EDouble'), [], p(1, 1, 1));
    attr('O1/RacingFrame', 'material', FRAME_MATERIAL, [], p(1, 1, 1));

    // O2: bicycle and component models
    clab('O2', 'ChallengerA2XL', ['O1/RacingBike'], p(1, 1, 1));
    attr('O2/ChallengerA2XL', 'regularSalesPrice', prim('EDouble'), ['O1/RacingBike/regularSalesPrice'], p(1, 1, 0), '4999.00');
    attr('O2/ChallengerA2XL', 'uciCertified', prim('EBoolean'), ['O1/RacingBike/uciCertified'], p(1, 1, 0), 'true');
    attr('O2/ChallengerA2XL', 'forTallCyclists', prim('EBoolean'), [], p(1, 1, 0), 'true');
    clab('O2', 'RocketA1XL', ['O1/RacingFrame'], p(1, 1, 1));
    attr('O2/RocketA1XL', 'weight', prim('EDouble'), ['O1/RacingFrame/weight'], p(1, 1, 0), '920.0');
    if (!o.fieldLeap) attr('O2/RocketA1XL', 'serialNumber', prim('EString'), ['O1/RacingFrame/serialNumber'], p(1, 1, 1));
    const v = (n: string) => (o.wf12Values ? WF12_TEST_VALUES[n] : null);
    attr('O2/RocketA1XL', 'topTubeLength', prim('EDouble'), ['O1/RacingFrame/topTubeLength'], p(1, 1, 0), v('topTubeLength'));
    attr('O2/RocketA1XL', 'downTubeLength', prim('EDouble'), ['O1/RacingFrame/downTubeLength'], p(1, 1, 0), v('downTubeLength'));
    attr('O2/RocketA1XL', 'seatTubeLength', prim('EDouble'), ['O1/RacingFrame/seatTubeLength'], p(1, 1, 0), v('seatTubeLength'));
    attr('O2/RocketA1XL', 'material', FRAME_MATERIAL, ['O1/RacingFrame/material'], p(1, 1, 0), v('material'));

    // O3: physical items
    clab('O3', 'Bike134123', ['O2/ChallengerA2XL'], p(1, 1, 0));
    clab('O3', 'Frame134123', ['O2/RocketA1XL'], p(1, 1, 0));
    attr('O3/Frame134123', 'serialNumber', prim('EString'),
        [o.fieldLeap ? 'O0/Component/serialNumber' : 'O2/RocketA1XL/serialNumber'], p(1, 1, 0), 's134123');
    if (o.customer) {
        clab('O3', 'SusanStorm', ['O0/Customer'], p(1, 1, 0));
        attr('O3/SusanStorm', 'fullName', prim('EString'), ['O0/Customer/fullName'], p(1, 1, 0), 'Susan Storm');
    }
    return r;
}

export function bc1(opts: Opts = {}): DeepModel {
    const all = rows(opts);
    const levelOfModel = new Map<Id, number>();
    for (const x of all) if (x.cls === 'Model') levelOfModel.set(x.id, x.level);
    const maxLevel = opts.onlyTop ? 0 : (opts.clabjectsUpTo ?? 3);
    const keepModel = (mid: Id) => !opts.onlyTop || mid === 'O0';
    const clabLevel = new Map<Id, number>();
    for (const x of all) if (x.cls === 'Clabject') clabLevel.set(x.id, levelOfModel.get(x.model)!);
    const keep = (x: Row): boolean =>
        x.cls === 'Model' ? keepModel(x.id)
            : x.cls === 'Clabject' ? clabLevel.get(x.id)! <= maxLevel
                : clabLevel.get(x.owner)! <= maxLevel;
    const kept = all.filter(keep);

    const elements = new Map<Id, DeepElement>();
    for (const x of kept) {
        if (x.cls === 'Model') {
            const lv: DeepLevel = {
                id: x.id, cls: 'Model', name: x.name, pot: x.pot, types: x.types, container: null, level: x.level,
                elements: kept.filter((c) => c.cls === 'Clabject' && c.model === x.id).map((c) => c.id),
                ownedEnumerations: x.id === 'O0' ? [FRAME_MATERIAL.id] : [],
            };
            elements.set(x.id, lv);
        } else if (x.cls === 'Clabject') {
            const c: DeepClabject = {
                id: x.id, cls: 'Clabject', name: x.name, pot: x.pot, types: x.types, container: x.model,
                isAbstract: null, isMultiType: null, supers: [],
                features: kept.filter((f) => f.cls === 'Attribute' && f.owner === x.id).map((f) => f.id),
            };
            elements.set(x.id, c);
        } else {
            const a: DeepAttribute = {
                id: x.id, cls: 'Attribute', name: x.name, pot: x.pot, types: x.types, container: x.owner,
                dataType: x.dataType, value: x.value,
            };
            elements.set(x.id, a);
        }
    }
    return { modelId: 'Pointer_bc1_m1', languageVersion: 1, elements, order: kept.map((x) => x.id),
        enumerations: new Map([[FRAME_MATERIAL.id, FRAME_MATERIAL]]) };
}

/** Values for the d = 0 fields the scale model creates, by field name. */
const SCALE_VALUES: Readonly<Record<string, string>> = {
    suitedForRace: 'true', suitedForToughTerrain: 'false', regularSalesPrice: '4999.00', weight: '920.0', serialNumber: 's1',
    ext1: '1.5', ext2: '2.5', ext3: '3.5',
};

/**
 * NFR-6 scale model (requirements.md NFR-6): BC1's O0 (Bicycle, Component) plus 4 categories on O1
 * (alternately Bicycle and Component, each with 3 EDouble extensions ext1..ext3, (1, 1, 1)), 5 models
 * per category on O2, and physical items on O3, one per model in turn, until there are n clabjects
 * (n >= 26 gives all of O1 and O2). Every clabject is planned with planInstantiate and every extension
 * with planAddAttribute; the plans are turned into DeepElements here, with path ids, because the core
 * has no "apply a plan" function (the executor is slice S5's). Every d = 0 field gets a value
 * (SCALE_VALUES), so a well-formed scale model has no check record.
 */
export function scaleModel(n: number): DeepModel {
    const base = bc1({ clabjectsUpTo: 0 });
    const elements = new Map<Id, DeepElement>(base.elements);
    const order = [...base.order];
    const cur = (): DeepModel => ({ ...base, elements, order });
    const put = (e: DeepElement) => { if (!elements.has(e.id)) order.push(e.id); elements.set(e.id, e); };
    let clabjects = [...elements.values()].filter((e) => e.cls === 'Clabject').length;
    const dataTypeOf = (f: Id): DataTypeRef | null => { const fe = elements.get(f); return fe?.cls === 'Attribute' ? fe.dataType : null; };

    const instantiate = (typeId: Id, targetModelId: Id, name: string): Id => {
        const m = cur();
        const p = planInstantiate(m, buildIndex(m), { typeId, targetModelId, name, values: SCALE_VALUES });
        if (!p.ok) throw new Error(`scaleModel: ${p.message}`);
        const plan: InstantiatePlan = p;
        const cid = `${targetModelId}/${name}`;
        const features = plan.fields.map((f) => `${cid}/${f.name}`);
        put({ id: cid, cls: 'Clabject', name, pot: plan.clabject.pot, types: [typeId], container: targetModelId, isAbstract: false, isMultiType: false, supers: [], features });
        for (const f of plan.fields) {
            put({ id: `${cid}/${f.name}`, cls: 'Attribute', name: f.name, pot: f.pot, types: [f.typeOf], container: cid, dataType: dataTypeOf(f.typeOf), value: f.value ?? null });
        }
        const lv = elements.get(targetModelId) as DeepLevel;
        put({ ...lv, elements: [...lv.elements, cid] });
        clabjects++;
        return cid;
    };
    const extend = (ownerId: Id, name: string) => {
        const m = cur();
        const p = planAddAttribute(m, buildIndex(m), { ownerId, name, dataType: PRIM.EDouble, pot: { start: 1, end: 1, depth: 1 } });
        if (!p.ok) throw new Error(`scaleModel: ${p.message}`);
        const plan: AddAttributePlan = p;
        const aid = `${ownerId}/${name}`;
        put({ id: aid, cls: 'Attribute', name: plan.name, pot: plan.pot, types: [], container: ownerId, dataType: prim('EDouble'), value: null });
        const o = elements.get(ownerId) as DeepClabject;
        put({ ...o, features: [...o.features, aid] });
    };

    const categories: Id[] = [];
    for (let i = 0; i < 4 && clabjects < n; i++) {
        const c = instantiate(i % 2 === 0 ? 'O0/Bicycle' : 'O0/Component', 'O1', `Category${i}`);
        for (const x of ['ext1', 'ext2', 'ext3']) extend(c, x);
        categories.push(c);
    }
    const models: Id[] = [];
    for (const c of categories) for (let j = 0; j < 5 && clabjects < n; j++) models.push(instantiate(c, 'O2', `${c.slice(3)}Model${j}`));
    for (let k = 0; clabjects < n && models.length > 0; k++) instantiate(models[k % models.length], 'O3', `Item${k}`);
    return { ...base, elements, order };
}

/** Deep copy (structuredClone), apply the edit to the copy's elements, return the copy. The shared fixture is never touched. */
export function mutate(m: DeepModel, edit: (els: Map<Id, any>) => void): DeepModel {
    const copy = structuredClone(m) as DeepModel;
    edit(copy.elements as Map<Id, any>);
    return copy;
}
