/**
 * Optional hooks a host tab passes to the shared EditorV2 canvas (prop `hostHooks`). Without them every
 * code path of EditorV2 is the default one. Types and pure helpers only, so that this module imports in
 * node Vitest (type-only imports below).
 */
import type { Node, Edge } from '@xyflow/react';
import type { ContextMenuItem } from './ContextMenu';

export interface EditorV2HostHooks {
  /** Extra or replacement items for a node's context menu; receives Jjodel's default items. */
  nodeMenuItems?: (nodeId: string, defaults: ContextMenuItem[]) => ContextMenuItem[];
  /** Called before any node delete (menu, keys, cut). Return true when the host has taken over. */
  onDeleteRequest?: (nodeIds: readonly string[]) => boolean;
  /** Hide the palette of metaclasses. */
  hidePalette?: boolean;
  /** Replace the ELK layout used on open and by the toolbar's Auto layout. */
  layout?: (nodes: Node[], edges: Edge[]) => Promise<Node[]>;
  /** Turn off duplicating outside the node menu: the toolbar's Duplicate is not shown, and the copy and paste keys do nothing.
   *  (The node menu's Duplicate is dropped by the host itself, through nodeMenuItems.) Added 2026-11-25, Elias (0014 amendment). */
  disableDuplicate?: boolean;
}

/** The node menu after the host hook: the defaults, unchanged, when there is no hook. */
export function applyNodeMenu(hooks: EditorV2HostHooks | undefined, nodeId: string, defaults: ContextMenuItem[]): ContextMenuItem[] {
  return hooks?.nodeMenuItems ? hooks.nodeMenuItems(nodeId, defaults) : defaults;
}

/** True when the host takes over the delete of these nodes: false when there is no hook or no id; otherwise the hook's answer. */
export function hostTakesDelete(hooks: EditorV2HostHooks | undefined, nodeIds: readonly string[]): boolean {
  if (!hooks?.onDeleteRequest || nodeIds.length === 0) return false;
  return hooks.onDeleteRequest(nodeIds) === true;
}
