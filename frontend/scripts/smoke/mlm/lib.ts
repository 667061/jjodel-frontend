/**
 * E2E library for the MLM scripts (thesis plan, Task 12). Library-driven Playwright against a running dev
 * server, run with `node --experimental-strip-types`; no Playwright Test config.
 *   PROBE_URL   dev server (default http://localhost:3072)
 *   MLM_BROWSER Playwright channel (default 'msedge', the installed Edge; no browser download)
 *   HEADED      any value: show the browser
 */
import { chromium, type Browser, type Page } from '@playwright/test';
import { seed, BOOT_MS, NAV_MS } from '../states.ts';

export const URL = (process.env.PROBE_URL || 'http://localhost:3072').replace(/\/$/, '');

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
    page.on('pageerror', (e) => console.log(`PAGEERROR ${e.message.slice(0, 300)}`));
    return { browser, page };
}

/** Creates an offline project through the dashboard and returns its id, or null. */
export async function createProject(page: Page, name: string): Promise<string | null> {
    await page.goto(`${URL}/#/allProjects`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForTimeout(BOOT_MS);
    await page.locator('button', { hasText: 'New Project' }).first().click();
    await page.waitForTimeout(1200);
    await page.locator('input[type="text"]').first().fill(name);
    await page.locator('button', { hasText: /^Create/ }).last().click();
    await page.waitForTimeout(5000);
    return page.evaluate(() => {
        const arr = JSON.parse(localStorage.getItem('projects') || '[]') as Array<{ id: string }>;
        return arr.length ? arr[arr.length - 1].id : null;
    });
}

/** Opens a project by id and hides the notification layers that can swallow clicks. */
export async function openProject(page: Page, projectId: string): Promise<void> {
    await page.goto(`${URL}/#/project?id=${projectId}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForTimeout(NAV_MS);
    await page.addStyleTag({ content: '.notification-widget, .notification-content, .donation-banner { pointer-events: none !important; display: none !important; }' }).catch(() => {});
}

/** Clicks the visible canvas pane of the active tab at (50, 50): a real gesture, so that later writes are
 *  recorded as undo entries (thesis spike T2.2 §7.2; the bottom-right corner is covered by the properties overlay). */
export async function clickPane(page: Page): Promise<void> {
    const pane = page.locator('.dock-tabpane-active .editor-v2 .react-flow__pane').first();
    const box = await pane.boundingBox();
    if (!box) throw new Error('clickPane: no visible canvas pane in the active tab');
    await page.mouse.click(box.x + 50, box.y + 50);
    await page.waitForTimeout(300);
}

/** Canonical dump of a model: one line per DObject of the model, sorted by containment path. Each line holds the
 *  class name, the name, every slot as name=values (pointers resolved to containment paths), the father's kind
 *  and `_state`; then one line per class and attribute of the model's metamodel (attribute type name and bounds).
 *  Ids never appear, so two runs of the same steps give the same text. */
export async function dumpModel(page: Page, modelId: string): Promise<string> {
    const lines = await page.evaluate((mid: string) => {
        const idl = (window as any).store.getState().idlookup as Record<string, any>;
        const model = idl[mid];
        if (!model) return [`MISSING MODEL ${mid}`];
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
        const show = (x: unknown) => (typeof x === 'string' && idl[x] ? `@${pathOf(x)}` : JSON.stringify(x));
        const out: string[] = [];
        for (const d of Object.values(idl)) {
            if (d?.className !== 'DObject' || !inModel(d)) continue;
            const slots = (d.features || []).map((f: string) => {
                const v = idl[f];
                return `${idl[v?.instanceof]?.name}=[${(v?.values || []).map(show).join(',')}]`;
            });
            out.push(`${pathOf(d.id)} | class=${idl[d.instanceof]?.name} | name=${JSON.stringify(d.name)} | father=${idl[d.father]?.className} | state=${JSON.stringify(d._state ?? null)} | ${slots.join(' ')}`);
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

/** Prints `SUMMARY pass=<n> fail=<n>` and returns the exit code (0 when nothing failed). */
export function summary(): number {
    console.log(`SUMMARY pass=${passCount} fail=${failCount}`);
    return failCount === 0 ? 0 : 1;
}
