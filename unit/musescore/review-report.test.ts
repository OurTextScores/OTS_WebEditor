import { afterEach, expect, it } from 'vitest';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

it('combines actual fixture captures, semantic changes, and evidence-bound review decisions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ots-review-test-')); roots.push(root);
  const baseline = path.join(process.cwd(), 'tools/musescore/visual-baseline');
  const current = path.join(root, 'current');
  await cp(baseline, current, { recursive: true });
  const manifestPath = path.join(current, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const imagePath = path.join(current, 'cross-staff.png');
  const changed = await sharp(imagePath).composite([{ input: { create: { width: 3, height: 3, channels: 4, background: 'red' } }, top: 0, left: 0 }]).png().toBuffer();
  await writeFile(imagePath, changed);
  manifest.cases.find((x: { id: string }) => x.id === 'cross-staff').imageSha256 = createHash('sha256').update(changed).digest('hex');
  manifest.semanticFailures.shift();
  manifest.semanticFailures.push({ id: 'tie-system-break', stage: 'edited-reload', message: '<script>bad</script>' });
  await writeFile(manifestPath, JSON.stringify(manifest));
  const run = (tool: string, ...args: string[]) => spawnSync(process.execPath, [`tools/musescore/${tool}.mjs`, ...args], { cwd: process.cwd(), encoding: 'utf8' });
  const visual = (name: string) => {
    const dir = path.join(root, name);
    const result = run('visual-report', baseline, current, dir);
    expect(result.status, result.stderr).toBe(1); // changed images still fail the visual gate
    return dir;
  };
  const first = visual('report');
  // Reuse the same comparison for decision and incomplete-result checks.
  // A fresh pixel comparison is still run below when the image itself changes.
  const second = path.join(root, 'second'), incomplete = path.join(root, 'incomplete');
  await cp(first, second, { recursive: true });
  await cp(first, incomplete, { recursive: true });
  expect(run('review-report', first).status).toBe(0);
  const summary = JSON.parse(await readFile(path.join(first, 'review-summary.json'), 'utf8'));
  const fixtureManifest = JSON.parse(await readFile(path.join(process.cwd(), 'tools/musescore/fixtures/osmd-fidelity/manifest.json'), 'utf8'));
  expect(summary.fixtures).toHaveLength(fixtureManifest.cases.length);
  expect(summary.fixtures.find((f: { id: string }) => f.id === 'cross-staff').pages[0].row.changedPixels).toBeGreaterThan(0);
  const nested = summary.fixtures.find((f: { id: string }) => f.id === 'nested-undotted');
  expect(nested.observed).toHaveLength(11);
  expect(nested.observed[0].classification).toBe('known');
  expect(nested.resolved).toHaveLength(1);
  expect(summary.fixtures.find((f: { id: string }) => f.id === 'tie-system-break').observed[0].classification).toBe('new');
  expect(summary.fixtures.find((f: { id: string }) => f.id === 'multipage-layout').pages).toHaveLength(2);
  const html = await readFile(path.join(first, 'review.html'), 'utf8');
  expect(html).toContain('cross-staff/crop-1.png');
  expect(html).toContain('tie-system-break/before.png');
  expect((await readFile(path.join(first, 'tie-system-break', 'current.png'))).length).toBeGreaterThan(0);
  expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
  expect(html).not.toContain('<script>bad</script>');
  const template = JSON.parse(await readFile(path.join(first, 'review-template.json'), 'utf8'));
  const decision = template.reviews.find((r: { id: string }) => r.id === 'cross-staff');
  decision.status = 'expected'; decision.rationale = 'Reviewed intentional mark';
  const decisions = path.join(root, 'decisions.json');
  await writeFile(decisions, JSON.stringify(template));
  expect(run('review-report', second, decisions).status).toBe(0);
  const reviewed = JSON.parse(await readFile(path.join(second, 'review-summary.json'), 'utf8'));
  expect(reviewed.fixtures.find((f: { id: string }) => f.id === 'cross-staff').review.state).toBe('current');
  // An actual change in this fixture's captured image invalidates the decision.
  const changedAgain = await sharp(imagePath).composite([{ input: { create: { width: 3, height: 3, channels: 4, background: 'blue' } }, top: 5, left: 5 }]).png().toBuffer();
  await writeFile(imagePath, changedAgain);
  manifest.cases.find((x: { id: string }) => x.id === 'cross-staff').imageSha256 = createHash('sha256').update(changedAgain).digest('hex');
  await writeFile(manifestPath, JSON.stringify(manifest));
  const third = visual('third');
  expect(run('review-report', third, decisions).status).toBe(0);
  const stale = JSON.parse(await readFile(path.join(third, 'review-summary.json'), 'utf8'));
  expect(stale.fixtures.find((f: { id: string }) => f.id === 'cross-staff').review.state).toBe('stale');
  expect(await readFile(path.join(third, 'review.html'), 'utf8')).toContain('stale — needs review');
  const incompletePath = path.join(incomplete, 'report.json');
  const incompleteReport = JSON.parse(await readFile(incompletePath, 'utf8'));
  delete incompleteReport.currentProvenance.semanticFailures;
  await writeFile(incompletePath, JSON.stringify(incompleteReport));
  expect(run('review-report', incomplete).status).toBe(0);
  const unknown = JSON.parse(await readFile(path.join(incomplete, 'review-summary.json'), 'utf8'));
  expect(unknown.fixtures.every((f: { semanticsAvailable: boolean }) => !f.semanticsAvailable)).toBe(true);
  expect(unknown.warnings.join(' ')).toContain('semantic status is unknown');
  expect(await readFile(path.join(incomplete, 'review.html'), 'utf8')).toContain('Semantic result unavailable');
}, 120_000);
