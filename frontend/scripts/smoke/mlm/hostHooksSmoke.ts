/**
 * hostHooksSmoke.ts -- the `hostHooks` prop of EditorV2 at its use sites (architecture §6.3), in the browser.
 *
 * New offline project -> metamodel `Person { name: EString, friend: Person }` -> model `hk` (no tab opened, so it
 * has no layout record) with bob, carol, dave and alice, alice.friend = bob (the one edge on the canvas) ->
 * EditorV2 mounted with `hostHooks` set, in its own React root over the page, with the app's own module
 * instances (store, React, contexts). The hooks record what they are asked; onDeleteRequest always takes over.
 * Checks:
 *   - layout: the hook places the nodes on the first open, and the toolbar's Auto layout calls it again;
 *   - the editor rendered (4 nodes, 1 edge, toolbar); the palette is hidden; the toolbar has no Duplicate;
 *   - node menu: built through nodeMenuItems (host item first, no Duplicate);
 *   - delete through the node menu, the Delete and Backspace keys, the toolbar, cut (Ctrl/Cmd+X) and the
 *     multi-select menu: the host is asked with the node ids, nothing is deleted;
 *   - Ctrl/Cmd+C then Ctrl/Cmd+V adds no node;
 *   - a mixed selection of one node and one edge, then Delete: the host is asked with the node id only, and
 *     neither the node nor the edge is deleted (§6.3: if onDeleteRequest returns true, nothing else is deleted).
 * A negative control (P12) runs the mixed case's "nothing deleted" predicate against the state a default delete
 * would leave (node and edge gone) and must reject it.
 *
 * Expected on the branch head: `SUMMARY pass=13 fail=0 controls_ok=1 controls_broken=0`, exit 0.
 * On a tree without the prop (ec4f2543e) the hooks are ignored and the checks fail, exit 1.
 *
 *   PROBE_URL=http://localhost:3072 MLM_BROWSER=msedge \
 *     node --disable-warning=ExperimentalWarning --experimental-strip-types scripts/smoke/mlm/hostHooksSmoke.ts
 */

import type { Page } from '@playwright/test';
import { WAIT_MS, check, control, createProject, launch, openProject, summary } from './lib.ts';

const MM = 'hk_mm';
const MODEL = 'hk';
/** Creation order; alice last, because her `friend` slot points at bob. */
const NAMES = ['bob', 'carol', 'dave', 'alice'];
const ALL = [...NAMES].sort().join(',');
const H = '.mlm-hooks-host';
const N = `${H} .react-flow__node`;
const E = `${H} .react-flow__edge`;
/** Time for a delete that should not happen to show up, after the host was asked. */
const SETTLE_MS = 1200;

interface HookLog { menu: string[]; asked: string[][]; layout: number }
interface ModelState { objs: string; friend: string[] }

/** Builds the metamodel and the model with its four objects; returns the model id. */
async function buildModel(page: Page): Promise<string> {
    await page.evaluate(async (mm: string) => {
        const w = window as any;
        const navbar = '/src/pages/components/Navbar.tsx';
        const nb = await import(navbar);
        nb.createM2(w.LProject.getProject(), mm);
    }, MM);
    await page.waitForFunction((mm: string) => (window as any).LProject.getProject().metamodels
        .find((m: any) => m.name === mm)?.packages?.length === 1, MM, { timeout: WAIT_MS });
    await page.waitForTimeout(1500);
    await page.evaluate((mm: string) => {
        (window as any).LProject.getProject().metamodels.find((m: any) => m.name === mm).packages[0].addClass('Person');
    }, MM);
    await page.waitForFunction((mm: string) => (window as any).LProject.getProject().metamodels.find((m: any) => m.name === mm)
        .packages[0].classes.some((c: any) => c.name === 'Person'), MM, { timeout: WAIT_MS });
    await page.evaluate(async (mm: string) => {
        const w = window as any;
        const sel = '/src/redux/selectors/selectors.ts';
        const mod = await import(sel);
        const S = mod.default ?? mod.Selectors;
        const person = w.LProject.getProject().metamodels.find((m: any) => m.name === mm).packages[0].classes.find((c: any) => c.name === 'Person');
        person.addAttribute('name', w.LPointerTargetable.from(S.getPrimitiveType('EString')).id);
    }, MM);
    await page.waitForFunction((mm: string) => (window as any).LProject.getProject().metamodels.find((m: any) => m.name === mm)
        .packages[0].classes.find((c: any) => c.name === 'Person').attributes.some((a: any) => a.name === 'name'), MM, { timeout: WAIT_MS });
    await page.evaluate((mm: string) => {
        const person = (window as any).LProject.getProject().metamodels.find((m: any) => m.name === mm).packages[0].classes.find((c: any) => c.name === 'Person');
        person.addReference('friend', person.id);
    }, MM);
    await page.waitForFunction((mm: string) => (window as any).LProject.getProject().metamodels.find((m: any) => m.name === mm)
        .packages[0].classes.find((c: any) => c.name === 'Person').references.some((r: any) => r.name === 'friend'), MM, { timeout: WAIT_MS });
    await page.evaluate(async (names: string[]) => {
        const w = window as any;
        const navbar = '/src/pages/components/Navbar.tsx';
        const nb = await import(navbar);
        const p = w.LProject.getProject();
        nb.createM1(p, p.metamodels.find((m: any) => m.name === names[0]), false, names[1]);
    }, [MM, MODEL]);
    await page.waitForFunction((model: string) => (window as any).LProject.getProject().models
        .some((m: any) => m.name === model), MODEL, { timeout: WAIT_MS });
    const modelId = await page.evaluate((model: string) => (window as any).LProject.getProject().models
        .find((m: any) => m.name === model).id as string, MODEL);
    await page.waitForTimeout(1500);
    for (const name of NAMES) {
        const created = await page.evaluate(async (a: string[]) => {
            const [mid, n] = a;
            const idl = (window as any).store.getState().idlookup;
            const bob = (idl[mid]?.objects ?? []).map((id: string) => idl[id]).find((o: any) => o?.name === 'bob');
            const ca = '/src/components/editor-v2/hooks/createAdapter.ts';
            const mod = await import(ca);
            const seed: Record<string, unknown> = n === 'alice' ? { name: n, friend: bob?.id } : { name: n };
            return mod.createInstance(mid, 'Person', null, null, seed) as { ok: boolean; reason?: string };
        }, [modelId, name]);
        if (!created.ok) throw new Error(`createInstance ${name} failed: ${created.reason}`);
        await page.waitForFunction((a: string[]) => {
            const idl = (window as any).store.getState().idlookup;
            return (idl[a[0]]?.objects ?? []).some((id: string) => idl[id]?.name === a[1]);
        }, [modelId, name], { timeout: WAIT_MS });
    }
    return modelId;
}

/** Mounts <Provider store><contexts><EditorV2 modelid hostHooks/></contexts></Provider> in a fixed overlay, with the
 *  app's own module URLs, so the editor shares the store and React with the app. Returns 'ok' or what was missing. */
async function mountHostEditor(page: Page, modelId: string): Promise<string> {
    return page.evaluate(async (mid: string) => {
        const w = window as any;
        const urls = performance.getEntriesByType('resource').map((e) => e.name);
        const dep = (re: RegExp) => urls.find((u) => re.test(u));
        const reactUrl = dep(/\/deps\/react\.js/);
        const domUrl = dep(/\/deps\/react-dom_client\.js/);
        const reduxUrl = dep(/\/deps\/react-redux\.js/);
        if (!reactUrl || !domUrl || !reduxUrl) return `deps not found ${reactUrl} ${domUrl} ${reduxUrl}`;
        const R = await import(reactUrl); const React = R.default ?? R;
        const D = await import(domUrl); const createRoot = D.createRoot ?? D.default?.createRoot;
        const RR = await import(reduxUrl); const Provider = RR.Provider ?? RR.default?.Provider;
        const src = (p: string) => import(p);
        const Ed = await src('/src/components/editor-v2/EditorV2.tsx');
        const providers = [
            (await src('/src/contexts/SettingsModalContext.tsx')).SettingsModalProvider,
            (await src('/src/components/Toast/index.ts').catch(() => src('/src/components/Toast/index.tsx'))).ToastProvider,
            (await src('/src/contexts/DevModeContext.tsx')).DevModeProvider,
            (await src('/src/contexts/GlobalDrawerContext.tsx')).GlobalDrawerProvider,
            (await src('/src/contexts/FeaturesPanelContext.tsx')).FeaturesPanelProvider,
            (await src('/src/contexts/TreeViewPanelContext.tsx')).TreeViewPanelProvider,
            (await src('/src/components/editor-v2/ActiveEditorContext.tsx')).ActiveEditorProvider,
        ];
        const wrap = (el: any) => providers.reduceRight((acc: any, P: any) => React.createElement(P, null, acc), el);
        w.__hk = { menu: [] as string[], asked: [] as string[][], layout: 0 };
        const hostHooks = {
            nodeMenuItems: (id: string, d: any[]) => { w.__hk.menu.push(id); return [{ label: 'HOST ITEM' }, ...d.filter((i: any) => i.label !== 'Duplicate')]; },
            onDeleteRequest: (ids: readonly string[]) => { w.__hk.asked.push([...ids]); return true; },
            hidePalette: true,
            layout: async (nodes: any[]) => { w.__hk.layout++; return nodes.map((n: any, i: number) => ({ ...n, position: { x: 1000 + i * 300, y: 77 } })); },
            disableDuplicate: true,
        };
        const host = document.createElement('div');
        host.className = 'mlm-hooks-host';
        host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff;display:flex;';
        document.body.appendChild(host);
        createRoot(host).render(React.createElement(Provider, { store: w.store }, wrap(React.createElement(Ed.EditorV2 ?? Ed.default, { modelid: mid, hostHooks }))));
        return 'ok';
    }, modelId);
}

/** Waits for a page condition; false instead of a throw when it does not come (the red run must go on). */
async function waitUntil(page: Page, fn: (arg: any) => boolean, arg: unknown, timeout = 10000): Promise<boolean> {
    return page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
}

async function main(): Promise<number> {
    const { browser, page } = await launch();
    try {
        const pid = await createProject(page, `HOSTHOOKS_${Date.now()}`);
        if (!pid) throw new Error('project not created');
        await openProject(page, pid);
        const modelId = await buildModel(page);
        const mounted = await mountHostEditor(page, modelId);
        if (mounted !== 'ok') throw new Error(`mount: ${mounted}`);
        page.setDefaultTimeout(15000);

        const hk = (): Promise<HookLog> => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__hk)));
        const state = (): Promise<ModelState> => page.evaluate((mid: string) => {
            const idl = (window as any).store.getState().idlookup;
            const objs = (idl[mid]?.objects ?? []).map((id: string) => idl[id]).filter(Boolean);
            const alice = objs.find((o: any) => o.name === 'alice');
            const slot = (alice?.features ?? []).map((v: string) => idl[v]).find((v: any) => idl[v?.instanceof]?.name === 'friend');
            const friend = (slot?.values ?? []).map((x: string) => idl[x]?.name ?? x);
            return { objs: objs.map((o: any) => o.name).sort().join(','), friend };
        }, modelId);
        const untouched = (s: ModelState) => s.objs === ALL && s.friend.join(',') === 'bob';
        const nodeCount = () => page.locator(N).count();
        const edgeCount = () => page.locator(E).count();
        const askedCount = (n: number) => waitUntil(page, (k: number) => (window as any).__hk.asked.length === k, n, 5000);
        const pick = async (name: string, mod?: 'Shift') => {
            const b = await page.locator(N, { hasText: name }).first().boundingBox();
            if (!b) throw new Error(`no node box for ${name}`);
            if (mod) await page.keyboard.down(mod);
            // Bottom of the node: away from the name, whose double click opens the name editor.
            await page.mouse.click(b.x + b.width / 2, b.y + b.height - 6);
            if (mod) await page.keyboard.up(mod);
            await page.waitForTimeout(400);
        };
        const toolbar = (title: string) => page.evaluate((a: string[]) => {
            const b = [...document.querySelectorAll(`${a[0]} button`)].find((x) => x.getAttribute('title') === a[1]) as HTMLButtonElement | undefined;
            if (!b) return false;
            b.click();
            return true;
        }, [H, title]);
        const openMenu = async (name: string) => {
            await page.locator(N, { hasText: name }).first().click({ button: 'right', force: true });
            await waitUntil(page, () => document.querySelectorAll('.context-menu .context-menu__item').length > 0, undefined, 5000);
            return page.evaluate(() => [...document.querySelectorAll('.context-menu .context-menu__item')].map((e) => (e.textContent || '').trim()));
        };
        const menuClick = async (label: string) => {
            const ok = await page.evaluate((l: string) => {
                const it = [...document.querySelectorAll('.context-menu .context-menu__item')].find((e) => (e.textContent || '').trim() === l) as HTMLElement | undefined;
                if (!it) return false;
                it.click();
                return true;
            }, label);
            if (!ok) throw new Error(`no menu item ${label}`);
        };
        const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
        const step = async (label: string, body: () => Promise<[boolean, string]>) => {
            try {
                const [ok, detail] = await body();
                check(label, ok, detail);
            } catch (e) {
                check(label, false, e instanceof Error ? e.message : String(e));
            }
        };

        // First open: the nodes are drawn and the open-time layout ran through the hook.
        await waitUntil(page, (sel: string) => document.querySelectorAll(sel).length === 4, N, WAIT_MS);
        await waitUntil(page, (sel: string) => document.querySelectorAll(sel).length >= 1, E, 15000);
        const laidOut = await waitUntil(page, () => (window as any).__hk.layout >= 1, undefined, 15000);
        await page.waitForTimeout(1500);
        await step('open: layout hook used on first open', async () => {
            const pos = await page.evaluate((sel: string) => [...document.querySelectorAll(sel)].map((e) => (e as HTMLElement).style.transform), N);
            const log = await hk();
            return [laidOut && pos.length === 4 && pos.every((t) => /translate\(\d{4}px, 77px\)/.test(t)), JSON.stringify({ layout: log.layout, pos })];
        });
        let rendered = false;
        await step('host editor rendered (4 nodes, 1 edge, toolbar)', async () => {
            const counts = { editor: await page.locator(`${H} .editor-v2`).count(), nodes: await nodeCount(), edges: await edgeCount(),
                autoLayout: await page.locator(`${H} button[title="Auto layout"]`).count() };
            rendered = counts.editor === 1 && counts.nodes === 4 && counts.edges === 1 && counts.autoLayout === 1;
            return [rendered, JSON.stringify(counts)];
        });
        await step('palette hidden', async () => [rendered && (await page.locator(`${H} .editor-v2-palette`).count()) === 0, '']);
        await step('toolbar Duplicate not shown', async () => [rendered && (await page.locator(`${H} button[title="Duplicate selected"]`).count()) === 0, '']);
        await step('toolbar Auto layout uses the hook', async () => {
            const before = (await hk()).layout;
            if (!(await toolbar('Auto layout'))) throw new Error('no Auto layout button');
            const ok = await waitUntil(page, (k: number) => (window as any).__hk.layout === k, before + 1, 10000);
            return [ok, `layout calls ${before} -> ${(await hk()).layout}`];
        });

        // Node menu, and its Delete.
        await step('node menu through nodeMenuItems', async () => {
            const menu = await openMenu('alice');
            return [menu[0] === 'HOST ITEM' && !menu.includes('Duplicate') && menu.includes('Delete') && (await hk()).menu.length >= 1, JSON.stringify(menu)];
        });
        await step('node menu Delete asks the host, deletes nothing', async () => {
            await menuClick('Delete');
            const asked = await askedCount(1);
            await page.waitForTimeout(SETTLE_MS);
            const s = await state();
            return [asked && untouched(s) && (await nodeCount()) === 4, JSON.stringify({ asked: (await hk()).asked, ...s })];
        });

        // Keys and toolbar on a single selection.
        await step('Delete and Backspace ask the host, delete nothing', async () => {
            await pick('dave');
            await pick('bob');
            await page.keyboard.press('Delete');
            const a1 = await askedCount(2);
            await page.keyboard.press('Backspace');
            const a2 = await askedCount(3);
            await page.waitForTimeout(SETTLE_MS);
            const s = await state();
            return [a1 && a2 && untouched(s) && (await nodeCount()) === 4, JSON.stringify({ asked: (await hk()).asked.slice(1), ...s })];
        });
        await step('toolbar delete asks the host, deletes nothing', async () => {
            if (!(await toolbar('Delete selected (Delete/Backspace)'))) throw new Error('no toolbar delete button');
            const asked = await askedCount(4);
            await page.waitForTimeout(SETTLE_MS);
            const s = await state();
            return [asked && untouched(s) && (await nodeCount()) === 4, JSON.stringify({ asked: (await hk()).asked.slice(3), ...s })];
        });
        await step('cut asks the host, deletes nothing', async () => {
            await pick('bob');
            await page.keyboard.press(`${mod}+x`);
            const asked = await askedCount(5);
            await page.waitForTimeout(SETTLE_MS);
            const s = await state();
            return [asked && untouched(s) && (await nodeCount()) === 4, JSON.stringify({ asked: (await hk()).asked.slice(4), ...s })];
        });
        await step('copy and paste do nothing', async () => {
            await pick('carol');
            await page.keyboard.press(`${mod}+c`);
            await page.waitForTimeout(400);
            await page.keyboard.press(`${mod}+v`);
            await page.waitForTimeout(2000);
            const s = await state();
            return [untouched(s) && (await nodeCount()) === 4, JSON.stringify({ nodes: await nodeCount(), ...s })];
        });

        // Multi-select through the node menu.
        await step('multi-select delete asks the host with 2 ids, deletes nothing', async () => {
            await pick('carol');
            await pick('dave', 'Shift');
            await openMenu('dave');
            await menuClick('Delete 2 nodes');
            const asked = await askedCount(6);
            await page.waitForTimeout(SETTLE_MS);
            const last = (await hk()).asked.at(-1) ?? [];
            const s = await state();
            return [asked && last.length === 2 && untouched(s) && (await nodeCount()) === 4, JSON.stringify({ last, ...s })];
        });

        // Mixed selection: the edge alice -> bob, then carol with Shift; Delete.
        await step('mixed node+edge selection, Delete: host asked with the node id only, neither node nor edge deleted', async () => {
            await page.keyboard.press('Escape');
            const pt = await page.evaluate((sel: string) => {
                // UnifiedEdge's invisible hit-test path (transparent, 20px wide), else any drawn path of the edge.
                const p = (document.querySelector(`${sel} path[stroke="transparent"]`) ?? document.querySelector(`${sel} path[d]`)) as SVGPathElement | null;
                const m = p?.getScreenCTM();
                if (!p || !m) return null;
                const q = p.getPointAtLength(p.getTotalLength() * 0.3);
                return { x: q.x * m.a + q.y * m.c + m.e, y: q.x * m.b + q.y * m.d + m.f };
            }, E);
            if (!pt) throw new Error('no edge path on the canvas');
            await page.mouse.click(pt.x, pt.y);
            await page.waitForTimeout(400);
            await pick('carol', 'Shift');
            const sel = await page.evaluate((a: string[]) => ({
                nodes: [...document.querySelectorAll(`${a[0]}.selected`)].map((e) => e.getAttribute('data-id') ?? ''),
                edges: [...document.querySelectorAll(`${a[1]}.selected`)].map((e) => e.getAttribute('data-id') ?? e.id),
            }), [N, E]);
            const carolId = await page.locator(N, { hasText: 'carol' }).first().getAttribute('data-id');
            const mixed = sel.nodes.length === 1 && sel.nodes[0] === carolId && sel.edges.length === 1;
            const edgesBefore = await edgeCount();
            await page.keyboard.press('Delete');
            const asked = await askedCount(7);
            await page.waitForTimeout(SETTLE_MS);
            const last = (await hk()).asked.at(-1) ?? [];
            const s = await state();
            const edgesAfter = await edgeCount();
            const nothingDeleted = (x: ModelState, edges: number) => untouched(x) && edges === edgesBefore;
            // Negative control (P12): the predicate must reject the state a default delete leaves (carol and the edge gone).
            control('negative control (P12): "nothing deleted" accepts the state after a default delete of carol and the edge',
                nothingDeleted({ objs: NAMES.filter((n) => n !== 'carol').sort().join(','), friend: [] }, edgesBefore - 1));
            const ok = mixed && asked && last.length === 1 && last[0] === carolId && nothingDeleted(s, edgesAfter) && (await nodeCount()) === 4;
            return [ok, JSON.stringify({ selection: sel, carolId, last, edges: `${edgesBefore} -> ${edgesAfter}`, ...s })];
        });
    } catch (e) {
        check('smoke ran to the end', false, e instanceof Error ? e.stack ?? e.message : String(e));
    } finally {
        await browser.close();
    }
    return summary();
}

main().then((code) => { process.exitCode = code; }, (err: unknown) => {
    console.log(`ERROR ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    summary();
    process.exitCode = 1;
});
