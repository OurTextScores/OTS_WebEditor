import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { compareFacts, musicXmlFacts } from './cross-engine-facts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const fixtures = path.join(here, 'fixtures/osmd-fidelity');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function hashTree(root) {
  const files = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) files.push(file);
    }
  }
  await visit(root);
  const digest = createHash('sha256');
  for (const file of files.sort()) digest.update(path.relative(root, file)).update('\0').update(createHash('sha256').update(await readFile(file)).digest());
  return digest.digest('hex');
}

/** Experimental triage: no cross-engine pixel comparisons or correctness verdicts. */
export async function verifyCrossEngine(WebMscore, renderer, bundle) {
  const out = process.env.MS47_CROSS_OUTPUT;
  if (!out) throw new Error('MS47_CROSS_OUTPUT must name a new output directory');
  const root = path.resolve(out);
  const osmdRoot = path.resolve(process.env.OSMD_SOURCE || path.join(repo, '../opensheetmusicdisplay'));
  const pin = JSON.parse(await readFile(path.join(here, 'osmd-pilot.json'), 'utf8'));
  const git = (...args) => execFileSync('git', ['-C', osmdRoot, ...args], { encoding: 'utf8' }).trim();
  const commit = git('rev-parse', 'HEAD');
  assert.equal(commit, pin.commit, 'OSMD checkout does not match the pilot pin');
  assert.equal(git('status', '--porcelain', '--untracked-files=no'), '', 'OSMD tracked sources must be clean');
  const packageJson = JSON.parse(await readFile(path.join(osmdRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.version, pin.packageVersion, 'OSMD package version');
  const osmdBundle = path.join(osmdRoot, packageJson.main);
  const osmdSha256 = sha(await readFile(osmdBundle));
  const fixtureBytes = await readFile(path.join(fixtures, 'manifest.json'));
  const manifest = JSON.parse(fixtureBytes.toString());
  const resourceRoot = process.env.MS47_RESOURCE_ROOT || path.resolve(repo, '../ms47-build-native/res');
  const gitOts = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  const wasm = bundle ? path.join(bundle, 'webmscore.lib.wasm') : path.join(process.env.MS47_ARTIFACTS || path.join(process.env.MS47_SOURCE || path.resolve(repo, '../ms47-spike'), 'build.artifacts'), 'ms47_bridge.wasm');
  await mkdir(root); // a previous report is never overwritten
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 1 });
  const diagnostics = [];
  page.on('console', msg => { if (['warning', 'error'].includes(msg.type())) diagnostics.push(`${msg.type()}: ${msg.text()}`); });
  page.on('pageerror', error => diagnostics.push(`pageerror: ${error.message}`));
  const report = { schemaVersion: 1, createdAt: new Date().toISOString(),
    purpose: 'Human triage only; counts are not a correctness oracle and images are not pixel-compared.',
    osmd: { commit, packageVersion: packageJson.version, bundleSha256: osmdSha256, lockfileSha256: sha(await readFile(path.join(osmdRoot, 'package-lock.json'))), bundleProvenance: 'existing local build; hash recorded, not independently rebuilt' },
    musescore: { target: bundle ? 'browser-package-in-node' : 'node-harness', wasmSha256: sha(await readFile(wasm)), resourceRoot, resourceTreeSha256: await hashTree(resourceRoot) },
    ots: { commit: gitOts('rev-parse', 'HEAD'), dirty: !!gitOts('status', '--porcelain'), pilotCodeSha256: sha(await readFile(fileURLToPath(import.meta.url))), factsCodeSha256: sha(await readFile(path.join(here, 'cross-engine-facts.mjs'))), rendererCodeSha256: sha(await readFile(path.join(here, 'svgcheck.mjs'))) },
    environment: { node: process.version, platform: `${os.type()} ${os.release()} ${os.arch()}`, browser: browser.version(), viewport: { width: 1400, height: 1200 }, osmdWidth: 1200, osmdOptions: { backend: 'svg', autoResize: false, newSystemFromXML: true, newPageFromXML: true } },
    fixtureManifestSha256: sha(fixtureBytes), cases: [], errors: [] };
  try {
    await page.setContent('<style>body{margin:0;background:white}#score{width:1200px}</style><div id="score"></div>');
    await page.addScriptTag({ path: osmdBundle });
    for (const fixture of manifest.cases) {
      let score;
      const diagnosticStart = diagnostics.length;
      try {
        const bytes = await readFile(path.join(fixtures, fixture.file));
        assert.equal(sha(bytes), fixture.sha256, `${fixture.id}: fixture hash`);
        const xml = bytes.toString();
        const input = musicXmlFacts(xml);
        const osmd = await page.evaluate(async xmlText => {
          document.querySelector('#score').replaceChildren();
          const viewer = new opensheetmusicdisplay.OpenSheetMusicDisplay('score', { backend: 'svg', autoResize: false, newSystemFromXML: true, newPageFromXML: true });
          await viewer.load(xmlText);
          viewer.render();
          const notes = new Set();
          for (const measure of viewer.Sheet.SourceMeasures)
            for (const container of measure.VerticalSourceStaffEntryContainers)
              for (const staff of container.StaffEntries)
                if (staff) for (const voice of staff.VoiceEntries) for (const note of voice.Notes) notes.add(note);
          const items = [...notes];
          const pitched = items.filter(note => !note.isRest());
          const svgs = [...document.querySelectorAll('#score svg')];
          if (!svgs.length) throw new Error('OSMD produced no SVG');
          await document.fonts.ready;
          // OSMD 2.2.1 NoteHeadShape.NONE is enum value 3 (pinned source).
          return { facts: { parts: viewer.Sheet.Instruments.length, measures: viewer.Sheet.SourceMeasures.length,
            pitchedNotes: pitched.length, rests: items.filter(note => note.isRest()).length,
            visiblePitchedNotes: pitched.filter(note => note.isVisible() && note.Notehead?.Shape !== 3).length },
            version: viewer.Version, sourceErrors: { measureErrors: viewer.Sheet.SheetErrors?.measureErrors ?? {}, errors: viewer.Sheet.SheetErrors?.errors ?? [] }, svgCount: svgs.length, svgs: svgs.map(svg => new XMLSerializer().serializeToString(svg)) };
        }, xml);
        score = await WebMscore.load('musicxml', new Uint8Array(bytes));
        const exported = await score.saveXml();
        const musescore = musicXmlFacts(exported);
        const svg = await score.saveSvg(0, true, false);
        const png = (await renderer.render(svg)).png;
        const artifacts = { osmdSvgs: osmd.svgs.map((_, i) => `${fixture.id}-osmd-page-${i + 1}.svg`), osmdPng: `${fixture.id}-osmd.png`,
          musescoreSvg: `${fixture.id}-musescore-page-1.svg`, musescorePng: `${fixture.id}-musescore-page-1.png`,
          musescoreXml: `${fixture.id}-musescore.musicxml` };
        for (let i = 0; i < osmd.svgs.length; i++) await writeFile(path.join(root, artifacts.osmdSvgs[i]), osmd.svgs[i], { flag: 'wx' });
        await page.locator('#score').screenshot({ path: path.join(root, artifacts.osmdPng) });
        await writeFile(path.join(root, artifacts.musescoreSvg), svg, { flag: 'wx' });
        await writeFile(path.join(root, artifacts.musescorePng), png, { flag: 'wx' });
        await writeFile(path.join(root, artifacts.musescoreXml), exported, { flag: 'wx' });
        report.cases.push({ id: fixture.id, fixtureSha256: fixture.sha256, osmdVersion: osmd.version, osmdSvgCount: osmd.svgCount,
          musescorePages: await score.npages(), osmdDiagnostics: diagnostics.slice(diagnosticStart), osmdSourceErrors: osmd.sourceErrors, facts: { input, osmd: osmd.facts, musescore },
          comparisons: compareFacts(input, osmd.facts, musescore), artifacts });
      } catch (error) {
        report.errors.push({ id: fixture.id, message: String(error?.stack || error) });
      } finally { if (score) await score.destroy(); }
    }
  } finally { await browser.close(); }
  const reviews = report.cases.flatMap(c => c.comparisons.filter(f => f.status === 'needs-review').map(f => ({ case: c.id, ...f })));
  report.summary = { completed: report.cases.length, failed: report.errors.length, needsReview: reviews.length,
    unsupported: report.cases.flatMap(c => c.comparisons).filter(f => f.status === 'unsupported').length };
  await writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  const rows = report.cases.map(c => `| ${c.id} | ${c.comparisons.filter(f => f.status === 'needs-review').map(f => f.metric).join(', ') || 'none'} | ${c.comparisons.filter(f => f.status === 'unsupported').map(f => f.metric).join(', ') || 'none'} | [OSMD](${c.artifacts.osmdPng}) · [MuseScore page 1](${c.artifacts.musescorePng}) |`).join('\n');
  await writeFile(path.join(root, 'report.md'), `# Cross-engine triage\n\nCounts are indicators for review, not correctness verdicts. Images use independent layouts and are not pixel-diffed. Inspect report.json for counts, provenance and errors.\n\n| Case | Needs review | Unsupported | Renderings |\n| --- | --- | --- | --- |\n${rows}\n\nErrors: ${report.errors.length}.\n`, { flag: 'wx' });
  if (report.errors.length) throw new Error(`Cross-engine pilot incomplete: ${report.errors.length} case(s) failed; see ${root}/report.json`);
  return report.summary;
}
