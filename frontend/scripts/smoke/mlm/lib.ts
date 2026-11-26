/**
 * E2E library for the MLM scripts (thesis plan, Task 12). Library-driven Playwright against a running dev
 * server, run with `node --experimental-strip-types`; no Playwright Test config.
 *   PROBE_URL   dev server (default http://localhost:3072)
 *   MLM_BROWSER Playwright channel (default 'msedge', the installed Edge; no browser download)
 *   HEADED      any value: show the browser
 */
import { chromium, type Browser, type Page } from '@playwright/test';
import { seed } from '../states.ts';

export const URL = (process.env.PROBE_URL || 'http://localhost:3072').replace(/\/$/, '');

/** Upper bound of the condition waits (waitForFunction, waitFor) of the MLM scripts. */
export const WAIT_MS = 60000;

/** Launches the browser and opens a page seeded for offline mode: `offline`, the offline user, and every
 *  welcome-modal key, including the 3.1.2 one `jjodel_welcome_3_1_1_seen` (WelcomeModal.tsx:6). */
export async function launch(): Promise<{ browser: Browser; page: Page }> {
    const browser = await chromium.launch({ channel: process.env.MLM_BROWSER ?? 'msedge', headless: !process.env.HEADED });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await seed(ctx, true);
    await ctx.addInitScript(() => {
        // esbuild's keepNames helper, which page.evaluate bodies may reference (README-probes.md).
        (globalThis as any).__name = (f: unknown) => f;
        localStorage.setItem('jjodel_welcome_3_1_1_seen', '1');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`PAGEERROR ${e.message}`));
    return { browser, page };
}

/** Creates an offline project through the dashboard and returns its id, or null. Waits for the dashboard's
 *  New Project button and then for a project of that name in localStorage (condition waits, from the M0 run). */
export async function createProject(page: Page, name: string): Promise<string | null> {
    await page.goto(`${URL}/#/allProjects`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    const newProject = page.locator('button', { hasText: 'New Project' }).first();
    await newProject.waitFor({ state: 'visible', timeout: 300000 });
    await newProject.click();
    await page.waitForTimeout(1200);
    await page.locator('input[type="text"]').first().fill(name);
    await page.locator('button', { hasText: /^Create/ }).last().click();
    await page.waitForFunction((n: string) => {
        const arr = JSON.parse(localStorage.getItem('projects') || '[]') as Array<{ name?: string }>;
        return arr.some((p) => p.name === n);
    }, name, { timeout: WAIT_MS });
    return page.evaluate((n: string) => {
        const arr = JSON.parse(localStorage.getItem('projects') || '[]') as Array<{ id: string; name?: string }>;
        return arr.filter((p) => p.name === n).pop()?.id ?? null;
    }, name);
}

/** Opens a project by id, waits until it is the loaded project (`LProject.getProject().id`), and hides the
 *  notification layers that can swallow clicks. */
export async function openProject(page: Page, projectId: string): Promise<void> {
    await page.goto(`${URL}/#/project?id=${projectId}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction((id: string) => (window as any).LProject?.getProject?.()?.id === id, projectId, { timeout: WAIT_MS });
    await page.waitForTimeout(3000);
    await page.addStyleTag({ content: '.notification-widget, .notification-content, .donation-banner { pointer-events: none !important; display: none !important; }' }).catch(() => {});
}

/** Clicks the visible canvas pane of the active tab at (50, 50): a real gesture, so that later writes are
 *  recorded as undo entries (thesis spike T2.2 §7.2; the bottom-right corner is covered by the properties overlay).
 *  Waits up to `timeout` ms for the pane to be visible. */
export async function clickPane(page: Page, timeout = WAIT_MS): Promise<void> {
    const pane = page.locator('.dock-tabpane-active .editor-v2 .react-flow__pane').first();
    await pane.waitFor({ state: 'visible', timeout });
    const box = await pane.boundingBox();
    if (!box) throw new Error('clickPane: no visible canvas pane in the active tab');
    await page.mouse.click(box.x + 50, box.y + 50);
    await page.waitForTimeout(300);
}

/** Canonical dump of a model: one line per DObject of the model, sorted by containment path. Each line holds the
 *  class name, the name, every slot as name=values (pointers resolved to containment paths), the father's kind
 *  and `_state`; then one line per class and attribute of the model's metamodel (attribute type name and bounds).
 *  Ids never appear and object keys are sorted (`canon`, from the M0 run), so two runs of the same steps give the
 *  same text. Throws when the model is not in the store, so that a missing model cannot compare equal to anything. */
export async function dumpModel(page: Page, modelId: string): Promise<string> {
    const lines = await page.evaluate((mid: string) => {
        const idl = (window as any).store.getState().idlookup as Record<string, any>;
        const model = idl[mid];
        if (!model) throw new Error(`dumpModel: model ${mid} is not in the store`);
        const canon = (v: unknown): unknown => {
            if (Array.isArray(v)) return v.map(canon);
            if (v && typeof v === 'object') {
                const out: Record<string, unknown> = {};
                for (const k of Object.keys(v as object).sort()) out[k] = canon((v as any)[k]);
                return out;
            }
            return v;
        };
        const pathOf = (id: string, depth = 0): string => {
            const d = idl[id];
            if (!d) return `MISSING`;
            if (depth > 50) return `CYCLE`;
            if (d.className === 'DModel') return d.name;
            if (d.className === 'DObject') {
                const own = idl[d.father];
                const label = d.name ?? `<${idl[d.instanceof]?.name}>`;
                if (own?.className === 'DValue') return `${pathOf(own.father, depth + 1)}/${idl[own.instanceof]?.name}/${label}`;
                return `${pathOf(d.father, depth + 1)}/${label}`;
            }
            if (d.className === 'DValue') return `${pathOf(d.father, depth + 1)}/${idl[d.instanceof]?.name}`;
            // metamodel elements: qualified by their own fathers (class, package, metamodel)
            const f = d.father && idl[d.father] ? pathOf(d.father, depth + 1) + '.' : '';
            return `${f}${d.name ?? d.className}`;
        };
        const inModel = (d: any): boolean => {
            for (let cur = d, n = 0; cur && n < 50; cur = idl[cur.father], n++) if (cur.id === mid) return true;
            return false;
        };
        const show = (x: unknown) => (typeof x === 'string' && idl[x] ? `@${pathOf(x)}` : JSON.stringify(canon(x)));
        const out: string[] = [];
        for (const d of Object.values(idl)) {
            if (d?.className !== 'DObject' || !inModel(d)) continue;
            const slots = (d.features || []).map((f: string) => {
                const v = idl[f];
                return `${idl[v?.instanceof]?.name}=[${(v?.values || []).map(show).join(',')}]`;
            });
            out.push(`${pathOf(d.id)} | class=${idl[d.instanceof]?.name} | name=${JSON.stringify(d.name)} | father=${idl[d.father]?.className} | state=${JSON.stringify(canon(d._state ?? null))} | ${slots.join(' ')}`);
        }
        // The model's metamodel: its classes and attributes (type name and bounds), keyed by path like the objects.
        const mmId = model.instanceof;
        const inMetamodel = (d: any): boolean => {
            for (let cur = d, n = 0; cur && n < 50; cur = idl[cur.father], n++) if (cur.id === mmId) return true;
            return false;
        };
        for (const d of Object.values(idl)) {
            if (!mmId || !inMetamodel(d)) continue;
            if (d.className === 'DClass') out.push(`${pathOf(d.id)} | DClass | abstract=${!!d.abstract}`);
            if (d.className === 'DAttribute') out.push(`${pathOf(d.id)} | DAttribute | type=${idl[d.type]?.name} | lower=${d.lowerBound} | upper=${d.upperBound}`);
        }
        return out.sort();
    }, modelId);
    return lines.join('\n');
}

let passCount = 0;
let failCount = 0;

/** Prints `PASS|FAIL <label> <detail>` and counts it. */
export function check(label: string, ok: boolean, detail?: string): void {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' ' + detail : ''}`);
    if (ok) passCount++;
    else failCount++;
}

let controlsOk = 0;
let controlsBroken = 0;

/** Negative control (P12): `wrongAccepted` is the result of an assertion that must be false. Prints `CONTROL ok <label>`
 *  when it is false (the wrong value was rejected), `CONTROL BROKEN <label> <detail>` when it is true. Not a check. */
export function control(label: string, wrongAccepted: boolean, detail?: string): void {
    console.log(`CONTROL ${wrongAccepted ? 'BROKEN' : 'ok'} ${label}${wrongAccepted && detail ? ' ' + detail : ''}`);
    if (wrongAccepted) controlsBroken++;
    else controlsOk++;
}

/** Prints `SUMMARY pass=<n> fail=<n> controls_ok=<n> controls_broken=<n>` and returns the exit code: 0 only when no
 *  check failed and no control was broken. */
export function summary(): number {
    console.log(`SUMMARY pass=${passCount} fail=${failCount} controls_ok=${controlsOk} controls_broken=${controlsBroken}`);
    return failCount === 0 && controlsBroken === 0 ? 0 : 1;
}
