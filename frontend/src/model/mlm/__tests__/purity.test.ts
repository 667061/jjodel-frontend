/**
 * NFR-8.3 as a test: no non-test file under src/model/mlm imports React, react-dom, react-redux,
 * the store, the joiner barrel or logicWrapper at runtime, or touches the DOM globals.
 * `import type` lines are allowed. This test asserts on source text, so it was proven on a
 * mutation bench (upstream CLAUDE.md §5); see the S1 commit message and thesis/log.md.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

function listTs(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) { if (name !== '__tests__') out.push(...listTs(full)); }
        else if (/\.tsx?$/.test(name)) out.push(full);
    }
    return out.sort();
}

const nonTestFiles = listTs(ROOT);

const BAD = [/from ['"]react['"]/, /from ['"]react-dom/, /from ['"]react-redux/, /from ['"][^'"]*\/joiner['"]/,
    /from ['"][^'"]*logicWrapper/, /from ['"][^'"]*\/redux\/store/, /\bwindow\./, /\bdocument\./];

describe('purity (NFR-8.3)', () => {
    // Positive control: the file list is not empty, so an all-green run is not a search that never ran.
    it('finds the core files', () => expect(nonTestFiles.map((f) => path.basename(f))).toEqual(expect.arrayContaining(['levels.ts', 'deepIndex.ts', 'types.ts'])));

    it.each(nonTestFiles)('%s imports nothing impure', (file) => {
        const src = readFileSync(file, 'utf8').replace(/^import type .*$/gm, '');
        for (const bad of BAD) expect(src).not.toMatch(bad);
    });
});
