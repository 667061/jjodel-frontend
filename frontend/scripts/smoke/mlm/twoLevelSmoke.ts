/**
 * twoLevelSmoke.ts -- NFR-3.1 two-level regression smoke (thesis plan Task 12).
 *
 * New offline project -> metamodel `Person { name: EString, age: EInt }` through the L-API
 * (createM2, addClass, addAttribute) -> model with one Person, age = 42, through createInstance
 * -> ProjectsApi.save -> reload -> reopen -> the canonical dump (lib.ts `dumpModel`: the model's objects
 * and its metamodel's classes and attributes) must equal the dump before the save, with Person age 42
 * and the metamodel attribute `age` of type EInt.
 * A negative control (P12) runs the same comparison against a dump that expects age = 43 and must reject it.
 *
 * Expected output on a healthy tree: `CONTROL ok ...` and `SUMMARY pass=1 fail=0 controls_ok=1 controls_broken=0`,
 * exit 0. The dump after the reload is printed between DUMP-BEGIN and DUMP-END.
 * DUMP_OUT (optional): file to write that dump to (for the comparison with another server, NFR-3.1).
 *
 *   PROBE_URL=http://localhost:3072 MLM_BROWSER=msedge \
 *     node --disable-warning=ExperimentalWarning --experimental-strip-types scripts/smoke/mlm/twoLevelSmoke.ts
 */

import { writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { URL, WAIT_MS, check, clickPane, control, createProject, dumpModel, launch, openProject, summary } from './lib.ts';

const MM = 'persons_mm';
const MODEL = 'persons';
const AGE_42 = /\bage=\[("?)42\1\]/;

/** Builds the metamodel and the model; returns the model id. */
async function buildTwoLevel(page: Page): Promise<string> {
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
    for (const [attr, type] of [['name', 'EString'], ['age', 'EInt']]) {
        await page.evaluate(async (a: string[]) => {
            const w = window as any;
            const sel = '/src/redux/selectors/selectors.ts';
            const mod = await import(sel);
            const S = mod.default ?? mod.Selectors;
            const typeId = w.LPointerTargetable.from(S.getPrimitiveType(a[1])).id;
            const pkg = w.LProject.getProject().metamodels.find((m: any) => m.name === a[2]).packages[0];
            pkg.classes.find((c: any) => c.name === 'Person').addAttribute(a[0], typeId);
        }, [attr, type, MM]);
        await page.waitForFunction((a: string[]) => (window as any).LProject.getProject().metamodels.find((m: any) => m.name === a[1])
            .packages[0].classes.find((c: any) => c.name === 'Person').attributes.some((x: any) => x.name === a[0]), [attr, MM], { timeout: WAIT_MS });
    }
    await page.evaluate(async (names: string[]) => {
        const w = window as any;
        const navbar = '/src/pages/components/Navbar.tsx';
        const nb = await import(navbar);
        const p = w.LProject.getProject();
        nb.createM1(p, p.metamodels.find((m: any) => m.name === names[0]), true, names[1]);
    }, [MM, MODEL]);
    await page.waitForFunction((model: string) => (window as any).LProject.getProject().models
        .some((m: any) => m.name === model), MODEL, { timeout: WAIT_MS });
    const modelId = await page.evaluate((model: string) => (window as any).LProject.getProject().models
        .find((m: any) => m.name === model).id as string, MODEL);
    // The model's editor tab mounts its canvas; a click on the pane, as a user would, before the edit.
    await page.waitForTimeout(2000);
    await clickPane(page);
    const created = await page.evaluate(async (mid: string) => {
        const ca = '/src/components/editor-v2/hooks/createAdapter.ts';
        const mod = await import(ca);
        return mod.createInstance(mid, 'Person', null, null, { name: 'alice', age: 42 }) as { ok: boolean; reason?: string };
    }, modelId);
    if (!created.ok) throw new Error(`createInstance failed: ${created.reason}`);
    await page.waitForFunction((mid: string) => {
        const idl = (window as any).store.getState().idlookup;
        const m = idl[mid];
        if (!m || (m.objects ?? []).length !== 1) return false;
        const o = idl[m.objects[0]];
        const vals = (o?.features ?? []).map((v: string) => idl[v]?.values ?? []);
        return vals.length === 2 && vals.every((v: unknown[]) => v.length === 1);
    }, modelId, { timeout: WAIT_MS });
    await page.waitForTimeout(1500);
    return modelId;
}

async function save(page: Page): Promise<void> {
    await page.evaluate(async () => {
        const w = window as any;
        const api = '/src/api/persistance/projects.ts';
        const mod = await import(api);
        await mod.ProjectsApi.save(w.LProject.getProject(), { silent: true });
    });
    await page.waitForTimeout(1500);
}

async function reloadAndReopen(page: Page, pid: string): Promise<void> {
    await page.goto(`${URL}/#/allProjects`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.locator('button', { hasText: 'New Project' }).first().waitFor({ state: 'visible', timeout: 300000 });
    await openProject(page, pid);
}

async function main(): Promise<number> {
    const { browser, page } = await launch();
    try {
        const pid = await createProject(page, `NFR31_${Date.now()}`);
        if (!pid) throw new Error('project not created');
        await openProject(page, pid);
        const modelId = await buildTwoLevel(page);
        const before = await dumpModel(page, modelId);
        await save(page);
        await reloadAndReopen(page, pid);
        const after = await dumpModel(page, modelId);

        console.log('DUMP-BEGIN');
        console.log(after);
        console.log('DUMP-END');
        if (process.env.DUMP_OUT) writeFileSync(process.env.DUMP_OUT, after + '\n');

        const objects = before.split('\n').filter((l) => l.includes(' | class='));
        const ageAttr = before.split('\n').find((l) => l.startsWith(`${MM}.default.Person.age | DAttribute |`)) ?? '';
        const wellFormed = objects.length === 1 && objects[0].includes('| class=Person |') && AGE_42.test(objects[0])
            && /\| type=EInt \|/.test(ageAttr);
        const ok = wellFormed && after === before;
        check('NFR-3.1 dump after save, reload and reopen equals the dump before the save, with Person age 42 and the metamodel attribute age: EInt',
            ok, ok ? `(${objects.length} object; metamodel line: ${ageAttr})` : `wellFormed=${wellFormed}\nBEFORE:\n${before}\nAFTER:\n${after}`);

        // Negative control (P12): the same comparison against a dump that expects age = 43 must reject the dump.
        const expected43 = before.replace(AGE_42, (_m, q: string) => `age=[${q}43${q}]`);
        if (expected43 === before) throw new Error('negative control could not be built: no age=42 in the dump');
        control('negative control (P12): the dump after reload equals a dump with age = 43', after === expected43);
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
