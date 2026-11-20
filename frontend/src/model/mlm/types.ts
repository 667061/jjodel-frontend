/**
 * Plain-data deep model (thesis/specs/architecture.md §4.1, verbatim).
 * Pure: no runtime imports. The shell's reader builds a DeepModel from the Jjodel D-layer;
 * the core reads it and never writes.
 */
export type Id = string;
export type MlmClass = 'Model' | 'Clabject' | 'Attribute' | 'Reference' | 'Cardinality';
export type RuleId = `WF-${number}`;

/** Stored potency exactly as in the three slots; null = slot empty. */
export interface StoredPotency { readonly start: number | null; readonly end: number | null; readonly depth: number | null; }
/** Effective potency after defaults (R-POT-4): always fully set. */
export interface Potency { readonly start: number; readonly end: number; readonly depth: number; }

export type DataTypeRef =
  | { readonly kind: 'primitive'; readonly id: Id; readonly name: string }          // e.g. 'EDouble'
  | { readonly kind: 'enum'; readonly id: Id; readonly name: string; readonly literals: readonly string[] }
  | { readonly kind: 'unresolved'; readonly id: Id };                                // pointer to nothing known

interface DeepElementBase {
  readonly id: Id;
  readonly cls: MlmClass;
  readonly name: string;
  readonly pot: StoredPotency;
  readonly types: readonly Id[];          // as stored, may contain ids not in the model
  readonly container: Id | null;          // containment parent (Jjodel father): Model of a clabject, clabject of a feature
}
export interface DeepLevel extends DeepElementBase { readonly cls: 'Model'; readonly level: number | null; readonly elements: readonly Id[]; readonly ownedEnumerations: readonly Id[]; }
export interface DeepClabject extends DeepElementBase { readonly cls: 'Clabject'; readonly isAbstract: boolean | null; readonly isMultiType: boolean | null; readonly supers: readonly Id[]; readonly features: readonly Id[]; }
export interface DeepAttribute extends DeepElementBase { readonly cls: 'Attribute'; readonly dataType: DataTypeRef | null; readonly value: string | null; }
export interface DeepReference extends DeepElementBase { readonly cls: 'Reference'; readonly target: Id | null; }
export type DeepElement = DeepLevel | DeepClabject | DeepAttribute | DeepReference;

export interface DeepModel {
  readonly modelId: Id;                      // the Jjodel M1 model
  readonly languageVersion: number;
  readonly elements: ReadonlyMap<Id, DeepElement>;
  readonly order: readonly Id[];             // stable read order (for deterministic output)
  /** Enumerations of the deep model by id (E1 DEnumerators, listed in some Model's ownedEnumerations), so that
   *  their names are known even when no attribute uses them. Optional, additive to architecture §4.1
   *  (Elias, 2026-11-20, S1 Task 5). */
  readonly enumerations?: ReadonlyMap<Id, DataTypeRef>;
}
