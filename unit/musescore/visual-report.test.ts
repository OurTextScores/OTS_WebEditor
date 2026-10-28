import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

describe('visual report', () => {
  it('reports changed regions and fails visibly when an image is missing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ots-visual-test-')); roots.push(root);
    const a = path.join(root, 'a'), b = path.join(root, 'b');
    await mkdir(a); await mkdir(b);
    const image = async (color: string) => sharp({ create: { width: 30, height: 30, channels: 4, background: color } }).png().toBuffer();
    const base = await image('white'), changed = await image('red');
    const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
    const env = { schemaVersion: 1, target: 'test', node: 'test', platform: 'test', environment: 'test', playwright: 'test', browser: 'test', viewport: {}, deviceScaleFactor: 1, svgWidth: 30, background: 'white', page: 0, highlightSelection: false, systemFontsSha256: 'a', resourceTreeSha256: 'b', fixtureManifestSha256: 'c', captureCodeSha256: 'd', rendererCodeSha256: 'e', captureDriverSha256: 'f' };
    for (const [dir, bytes] of [[a, base], [b, changed]] as const) {
      await writeFile(path.join(dir, 'case.png'), bytes);
      await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ ...env, cases: [{ id: 'case', file: 'case.png', fixtureSha256: 'f'.repeat(64), imageSha256: digest(bytes) }] }));
    }
    const run = (output: string) => spawnSync(process.execPath, ['tools/musescore/visual-report.mjs', a, b, output], { cwd: process.cwd(), encoding: 'utf8' });
    const identical = path.join(root, 'identical');
    const self = spawnSync(process.execPath, ['tools/musescore/visual-report.mjs', a, a, identical], { cwd: process.cwd(), encoding: 'utf8' });
    expect(self.status).toBe(0);
    const reportDir = path.join(root, 'report');
    expect(run(reportDir).status).toBe(1);
    const result = JSON.parse(await readFile(path.join(reportDir, 'report.json'), 'utf8'));
    expect(result.rows[0].changedPixels).toBe(900);
    expect(result.rows[0].crops).toBe(1);
    expect((await readFile(path.join(reportDir, 'case', 'crop-1.png'))).length).toBeGreaterThan(0);
    const currentManifest = JSON.parse(await readFile(path.join(b, 'manifest.json'), 'utf8'));
    currentManifest.systemFontsSha256 = 'different-fonts';
    await writeFile(path.join(b, 'manifest.json'), JSON.stringify(currentManifest));
    const incompatible = path.join(root, 'incompatible');
    expect(run(incompatible).status).toBe(1);
    expect(JSON.parse(await readFile(path.join(incompatible, 'report.json'), 'utf8')).warnings.join(' ')).toContain('systemFontsSha256');
    await rm(path.join(b, 'case.png'));
    const missing = path.join(root, 'missing');
    expect(run(missing).status).toBe(1);
    const missingReport = JSON.parse(await readFile(path.join(missing, 'report.json'), 'utf8'));
    expect(missingReport.warnings.join(' ')).toContain('case');
    expect(run(reportDir).status).not.toBe(0); // immutable report output
  });
});
