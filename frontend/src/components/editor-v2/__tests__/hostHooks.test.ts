import { describe, it, expect } from 'vitest';
import { applyNodeMenu, hostTakesDelete, type EditorV2HostHooks } from '../hostHooks';
import type { ContextMenuItem } from '../ContextMenu';

const A: ContextMenuItem = { label: 'Add child' };
const B: ContextMenuItem = { label: 'Delete', danger: true };

describe('applyNodeMenu', () => {
    it('no hooks: defaults pass through', () => expect(applyNodeMenu(undefined, 'n', [A, B])).toEqual([A, B]));
    it('hooks without nodeMenuItems: defaults pass through', () => expect(applyNodeMenu({ hidePalette: true }, 'n', [A, B])).toEqual([A, B]));
    it('menu hook replaces', () => expect(applyNodeMenu({ nodeMenuItems: (_, d) => [d[1]] }, 'n', [A, B])).toEqual([B]));
    it('menu hook receives the node id and the defaults', () => {
        const seen: Array<[string, ContextMenuItem[]]> = [];
        const hooks: EditorV2HostHooks = { nodeMenuItems: (id, d) => { seen.push([id, d]); return []; } };
        expect(applyNodeMenu(hooks, 'node-7', [A, B])).toEqual([]);
        expect(seen).toEqual([['node-7', [A, B]]]);
    });
});

describe('hostTakesDelete', () => {
    it('delete: no hook -> false; hook decides', () => {
        expect(hostTakesDelete(undefined, ['n'])).toBe(false);
        expect(hostTakesDelete({ onDeleteRequest: () => true }, ['n'])).toBe(true);
        expect(hostTakesDelete({ onDeleteRequest: () => true }, [])).toBe(false);
    });
    it('hooks without onDeleteRequest -> false', () => expect(hostTakesDelete({ hidePalette: true }, ['n'])).toBe(false));
    it('hook answering false -> false', () => expect(hostTakesDelete({ onDeleteRequest: () => false }, ['n'])).toBe(false));
    it('hook receives the node ids; not asked for no ids', () => {
        const asked: Array<readonly string[]> = [];
        const hooks: EditorV2HostHooks = { onDeleteRequest: (ids) => { asked.push(ids); return true; } };
        hostTakesDelete(hooks, ['a', 'b']);
        hostTakesDelete(hooks, []);
        expect(asked).toEqual([['a', 'b']]);
    });
});
