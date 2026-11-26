/**
 * NFR-3.1 two-level regression smoke (thesis plan, Task 12). New offline project -> metamodel
 * Person { name: EString, age: EInt } through the L-API -> model with one Person, age = 42, through
 * createInstance -> ProjectsApi.save -> reload -> reopen -> canonical dump, compared with the dump before the save.
 * Expected: `CONTROL ok` for the negative control (P12, the same assertion with age = 43) and
 *   `SUMMARY pass=1 fail=0 controls_ok=1 controls_broken=0`, exit 0.
 * DUMP_OUT (optional): file to write the dump after the reload to.
 * Run from frontend/: PROBE_URL=http://localhost:3072 MLM_BROWSER=msedge
 *   node --disable-warning=ExperimentalWarning --experimental-strip-types scripts/smoke/mlm/twoLevelSmoke.ts
 */
import { writeFileSync } from 'node:fs';
import { launch, createProject, openProject, dumpModel, check, control, summary, URL } from './lib.ts';

const { browser, page } = await launch();
let code = 1;
try {
    const pid = await createProject(page, `NFR31_${Date.now()}`);
    if (!pid) throw new Error('project not created');
    await openProject(page, pid);

    // Metamodel through the L-API.
    await page.evaluate(async () => {
        const w = window as any;
        const nb = await import('/src/pages/components/Navbar.tsx' as string);
        nb.createM2(w.LProject.getProject(), 'persons_mm');
    });
    await page.waitForTimeout(3000);
    await page.evaluate(async () => {
        const w = window as any;
        const sel = await import('/src/redux/selectors/selectors.ts' as string);
        const S = sel.default ?? sel.Selectors;
        const prim = (t: string) => w.LPointerTargetable.from(S.getPrimitiveType(t)).id;
        const pkg = () => w.LProject.getProject().metamodels.find((m: any) => m.name === 'persons_mm').packages[0];
        const person = () => pkg().classes.find((c: any) => c.name === 'Person');
        pkg().addClass('Person');
        await new Promise((r) => setTimeout(r, 1000));
        person().addAttribute('name', prim('EString'));
        await new Promise((r) => setTimeout(r, 1000));
        person().addAttribute('age', prim('EInt'));
        await new Promise((r) => setTimeout(r, 1000));
        return person().attributes.map((a: any) => a.name);
    }).then((attrs) => console.log(`INFO Person attributes ${JSON.stringify(attrs)}`));

    // Model with one Person through createInstance.
    const modelId = await page.evaluate(async () => {
        const w = window as any;
        const nb = await import('/src/pages/components/Navbar.tsx' as string);
        const p = w.LProject.getProject();
        const mm = p.metamodels.find((m: any) => m.name === 'persons_mm');
        nb.createM1(p, mm, true, 'persons');
        await new Promise((r) => setTimeout(r, 1500));
        return w.LProject.getProject().models.find((m: any) => m.name === 'persons')?.id ?? null;
    });
    if (!modelId) throw new Error('model not created');
    await page.waitForTimeout(3000);
    const created = await page.evaluate(async (mid: string) => {
        const ca = await import('/src/components/editor-v2/hooks/createAdapter.ts' as string);
        return ca.createInstance(mid, 'Person', null, null, { name: 'alice', age: 42 });
    }, modelId);
    if (!created?.ok) throw new Error(`createInstance failed: ${JSON.stringify(created)}`);
    await page.waitForTimeout(3000);

    const before = await dumpModel(page, modelId);

    // Save, reload, reopen.
    await page.evaluate(async () => {
        const w = window as any;
        const api = await import('/src/api/persistance/projects.ts' as string);
        await api.ProjectsApi.save(w.LProject.getProject(), { silent: true });
    });
    await page.waitForTimeout(2000);
    await page.goto(`${URL}/#/allProjects`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForTimeout(5000);
    await openProject(page, pid);
    const after = await dumpModel(page, modelId);

    console.log('DUMP BEGIN');
    console.log(after);
    console.log('DUMP END');
    if (process.env.DUMP_OUT) writeFileSync(process.env.DUMP_OUT, after + '\n');

    const person = after.split('\n').find((l) => l.includes('| class=Person |')) ?? '';
    const ageAttr = after.split('\n').find((l) => l.startsWith('persons_mm.default.Person.age | DAttribute |')) ?? '';
    check('NFR-3.1 dump after save+reload equals dump before save, with Person age 42 and the metamodel attribute age: EInt',
        after === before && /\bage=\[42\]/.test(person) && /\| type=EInt \|/.test(ageAttr),
        after === before ? `metamodel line: ${ageAttr || 'MISSING'}` : `\nBEFORE\n${before}\nAFTER\n${after}`);
    control('negative control (P12): the same assertion with age 43 must reject the dump', /\bage=\[43\]/.test(person), person);
} catch (e) {
    check('smoke ran to the end', false, String(e));
} finally {
    code = summary();
    await browser.close();
}
process.exit(code);
