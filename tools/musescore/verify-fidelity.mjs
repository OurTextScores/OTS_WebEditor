import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const fixtureDir = new URL('./fixtures/osmd-fidelity/', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function gitDiffHash() {
  const digest = createHash('sha256');
  const child = spawn('git', ['diff', '--binary'], { stdio: ['ignore', 'pipe', 'inherit'] });
  child.stdout.on('data', chunk => digest.update(chunk));
  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`git diff exited ${code}`)));
  });
  return digest.digest('hex');
}
async function resourceHash(root) {
  const entries = [];
  async function visit(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const target = path.join(dir, item.name);
      if (item.isDirectory()) await visit(target);
      else if (item.isFile()) entries.push(target);
    }
  }
  await visit(root);
  const digest = createHash('sha256');
  for (const file of entries.sort()) digest.update(path.relative(root, file)).update('\0').update(createHash('sha256').update(await readFile(file)).digest());
  return digest.digest('hex');
}

const text = (element, selector) => element.querySelector(selector)?.textContent?.trim() ?? null;

// Assert the notation facts separately from serialization, title and benign formatting changes.
export function assertFidelity(id, xml, { transposed = false } = {}) {
  const document = new JSDOM(xml, { contentType: 'application/xml' }).window.document;
  const notes = [...document.querySelectorAll('note')];
  const pitched = notes.filter(n => n.querySelector('pitch'));
  if (id === 'hidden-note') {
    assert.equal(text(pitched[0], 'pitch > step'), 'C');
    const hidden = pitched[0]?.getAttribute('print-object') === 'no' ||
      (text(pitched[0], 'notehead') === 'none' && text(pitched[0], 'stem') === 'none');
    assert.ok(hidden, 'the first note remains hidden, including its stem');
    assert.equal(text(pitched[1], 'pitch > step'), 'D');
    assert.notEqual(pitched[1]?.getAttribute('print-object'), 'no');
  } else if (id === 'tie-system-break') {
    assert.equal(text(pitched[0], 'pitch > step'), 'C');
    assert.equal(text(pitched[1], 'pitch > step'), 'C');
    assert.ok(pitched[0].querySelector('tie[type="start"]'));
    assert.ok(pitched[1].querySelector('tie[type="stop"]'));
    assert.ok(document.querySelector('measure:nth-of-type(2) > print[new-system="yes"]'));
  } else if (id === 'cross-staff') {
    assert.deepEqual(pitched.map(n => [text(n, 'pitch > step'), text(n, 'staff')]), [['C','1'],['D','2'],['E','1'],['F','2']]);
    assert.ok(document.querySelector('clef[number="1"] sign'));
    assert.equal(document.querySelector('clef[number="2"] sign')?.textContent, 'F');
    assert.ok(notes.some(n => n.querySelector('rest') && text(n, 'staff') === '2' && text(n, 'voice') !== text(pitched[0], 'voice')));
  } else if (id === 'nested-undotted') {
    assert.equal(pitched.length, 10);
    assert.equal(notes.filter(n => n.querySelector('rest')).length, 0, 'no rests are inserted');
    for (const note of pitched.slice(0, 9)) {
      assert.equal(text(note, 'type'), 'eighth');
      assert.equal(note.querySelectorAll('dot').length, 0);
      assert.equal(text(note, 'time-modification > actual-notes'), '9');
      assert.equal(text(note, 'time-modification > normal-notes'), '4');
    }
    assert.ok(document.querySelectorAll('tuplet[type="start"]').length >= 2);
    assert.ok(document.querySelectorAll('tuplet[type="stop"]').length >= 2);
  } else if (id === 'slur-system-break') {
    assert.ok(document.querySelector('measure:nth-of-type(2) > print[new-system="yes"]'));
    assert.equal(text(pitched[0], 'pitch > step'), 'C');
    assert.ok(pitched[0].querySelector('slur[type="start"]'));
    assert.equal(text(pitched[4], 'pitch > step'), 'G');
    assert.ok(pitched[4].querySelector('slur[type="stop"]'));
  } else if (id === 'dynamics-articulations') {
    assert.ok(document.querySelector('direction-type > dynamics > f'), 'forte remains');
    assert.ok(document.querySelector('direction-type > dynamics > p'), 'piano remains');
    assert.equal(text(pitched[0], 'pitch > step'), 'C');
    assert.ok(pitched[0].querySelector('articulations > accent'), 'accent remains on C');
    assert.equal(text(pitched[1], 'pitch > step'), 'D');
    assert.ok(pitched[1].querySelector('articulations > staccato'), 'staccato remains on D');
  } else if (id === 'octave-system-break') {
    const shifts = [...document.querySelectorAll('octave-shift')];
    assert.deepEqual(shifts.map(shift => [shift.getAttribute('type'), shift.getAttribute('size')]), [['down', '8'], ['stop', '8']]);
    assert.deepEqual(shifts.map(shift => shift.closest('measure')?.getAttribute('number')), ['1', '2'], 'octave line endpoints stay in their measures');
    assert.ok(document.querySelector('measure:nth-of-type(2) > print[new-system="yes"]'));
    assert.equal(pitched.length, 12);
    assert.equal(text(pitched[0], 'pitch > step'), 'C');
    assert.equal(text(pitched[4], 'pitch > step'), 'G');
  } else if (id === 'polyphony-accidentals') {
    assert.deepEqual(pitched.map(note => text(note, 'staff')), ['1','2','1','2','2','2','2','2']);
    assert.deepEqual(pitched.map(note => text(note, 'pitch > step')), ['C','D','E','F','G','A','B','C']);
    assert.equal(text(pitched[0], 'pitch > alter'), '1');
    assert.equal(text(pitched[2], 'pitch > alter'), '-1');
    assert.equal(text(pitched[0], 'accidental'), 'sharp');
    assert.equal(text(pitched[2], 'accidental'), 'flat');
    assert.ok(pitched.slice(0, 4).every(note => text(note, 'voice') === text(pitched[0], 'voice')));
    assert.ok(pitched.slice(4).every(note => text(note, 'voice') === text(pitched[4], 'voice')));
    assert.notEqual(text(pitched[0], 'voice'), text(pitched[4], 'voice'));
    assert.equal(text(document, 'clef[number="2"] > sign'), 'F');
  } else if (id === 'multipage-layout') {
    assert.ok(document.querySelector('measure:nth-of-type(2) > print[new-page="yes"]'));
    assert.equal(pitched.length, 8);
    assert.deepEqual([text(pitched[0], 'pitch > step'), text(pitched[4], 'pitch > step')], ['C', 'G']);
  } else if (id === 'crowded-markings') {
    assert.equal(pitched.length, 16);
    assert.ok(pitched.every(note => text(note, 'type') === '16th'), 'sixteenth-note passage remains dense');
    assert.deepEqual([...document.querySelectorAll('direction-type > dynamics')].map(d => d.firstElementChild?.tagName), ['ff', 'p', 'sfz', 'mf']);
    for (const [index, name] of ['accent', 'staccato', 'tenuto', 'staccatissimo'].entries())
      assert.ok(pitched[index].querySelector(`articulations > ${name}`), `${name} remains on its note`);
  } else if (id === 'transposing-enharmonic') {
    assert.equal(text(document, 'transpose > diatonic'), '-1');
    assert.equal(text(document, 'transpose > chromatic'), '-2');
    const pitches = pitched.map(note => [text(note, 'pitch > step'), text(note, 'pitch > alter') || '0']);
    assert.deepEqual(pitches, transposed ? [['D','1'],['E','-1'],['F','1'],['G','0']] : [['C','1'],['D','-1'],['E','0'],['F','0']]);
  } else if (id === 'grace-ornament-clef') {
    assert.equal(text(pitched[0], 'pitch > step'), 'B');
    assert.ok(pitched[0].querySelector('grace[slash="yes"]'));
    assert.equal(text(pitched[1], 'pitch > step'), 'C');
    assert.ok(pitched[1].querySelector('ornaments > trill-mark'));
    assert.deepEqual([...document.querySelectorAll('clef > sign')].map(clef => clef.textContent), ['G','F']);
    const bassAttributes = [...document.querySelectorAll('measure > attributes')].find(a => text(a, 'clef > sign') === 'F');
    assert.ok(bassAttributes, 'bass clef is present');
    const measureItems = [...bassAttributes.parentElement.children];
    assert.equal(measureItems.slice(0, measureItems.indexOf(bassAttributes)).filter(e => e.tagName === 'note' && !e.querySelector('grace')).length, 2, 'bass clef is mid-measure');
  } else if (id === 'multimeasure-rest') {
    assert.equal(text(document, 'measure-style > multiple-rest'), '2');
    assert.equal(document.querySelectorAll('note > rest').length, 2);
    assert.equal(pitched.length, 4);
  } else if (id === 'pickup-lyrics') {
    assert.equal(document.querySelector('measure')?.getAttribute('implicit'), 'yes');
    assert.equal(text(pitched[0], 'lyric > text'), 'sing');
    assert.ok(pitched[0].querySelector('lyric > extend'));
    // Explicit stop and untyped extend are different serializations; the rendered endpoint is checked below.
  } else throw new Error(`Unknown fidelity case ${id}`);
}

export function assertFidelityTiming(id, xml) {
  if (id !== 'nested-undotted') return;
  const document = new JSDOM(xml, { contentType: 'application/xml' }).window.document;
  const divisions = Number(document.querySelector('divisions')?.textContent);
  const notes = [...document.querySelectorAll('measure note')];
  assert.ok(Number.isInteger(divisions) && divisions > 0, 'valid MusicXML divisions');
  const total = notes.filter(note => !note.querySelector('chord')).reduce((sum, note) => sum + Number(note.querySelector('duration')?.textContent), 0);
  assert.equal(total, divisions * 4, 'nested passage must occupy exactly four quarter-note beats');
}

export function assertFidelityRendering(id, svg) {
  const count = name => [...svg.matchAll(new RegExp(`class="${name}"`, 'g'))].length;
  if (id === 'nested-undotted') {
    assert.equal(count('Note'), 10, 'all written noteheads are rendered');
    assert.equal(count('NoteDot'), 0, 'the fixture contains no dotted notes or rests');
  } else if (id === 'tie-system-break') {
    assert.ok(count('TieSegment') >= 2, 'tie has visible segments at the system break');
    assert.ok(count('StaffLines') >= 10, 'two systems are rendered');
  } else if (id === 'cross-staff') {
    assert.equal(count('Note'), 4, 'all cross-staff notes are rendered');
    assert.ok(count('StaffLines') >= 10, 'both staves are rendered');
  } else if (id === 'hidden-note') {
    assert.equal(count('Note'), 3, 'the hidden notehead is not rendered');
  } else if (id === 'slur-system-break') {
    assert.ok(count('SlurSegment') >= 2, 'slur has visible segments at the system break');
    assert.ok(count('StaffLines') >= 10, 'two systems are rendered');
  } else if (id === 'dynamics-articulations') {
    assert.ok(count('Dynamic') >= 2, 'both dynamics are rendered');
    assert.ok(count('Articulation') >= 2, 'both articulations are rendered');
  } else if (id === 'octave-system-break') {
    assert.ok(count('OttavaSegment') >= 2 && count('StaffLines') >= 10, 'octave line crosses systems');
  } else if (id === 'polyphony-accidentals') {
    assert.equal(count('Note'), 8); assert.ok(count('Accidental') >= 2 && count('StaffLines') >= 10);
  } else if (id === 'multipage-layout') {
    assert.equal(count('Note'), 4, 'first page has four notes');
  } else if (id === 'crowded-markings') {
    assert.ok(count('Dynamic') >= 4 && count('Articulation') >= 4);
  } else if (id === 'transposing-enharmonic') {
    assert.equal(count('Note'), 4); assert.ok(count('Accidental') >= 1);
  } else if (id === 'grace-ornament-clef') {
    assert.equal(count('Note'), 5); assert.ok(count('Clef') >= 2 && count('Ornament') >= 1);
  } else if (id === 'multimeasure-rest') {
    assert.ok(count('MMRest') > 0, 'multi-measure rest is rendered');
  } else if (id === 'pickup-lyrics') {
    assert.ok(count('Lyrics') > 0 && count('LyricsLineSegment') > 0, 'lyric and extension are rendered');
    const document = new JSDOM(svg, { contentType: 'image/svg+xml' }).window.document;
    const notes = [...document.querySelectorAll('[class="Note"]')];
    const line = document.querySelector('[class="LyricsLineSegment"]');
    const matrix = element => element?.parentElement?.getAttribute('transform')?.match(/^matrix\(([^)]+)\)$/)?.[1].trim().split(/[ ,]+/).map(Number);
    const lineMatrix = matrix(line), nextNoteMatrix = matrix(notes[2]);
    const points = line?.getAttribute('points')?.trim().split(/\s+/).map(pair => pair.split(',').map(Number));
    assert.ok(lineMatrix?.length === 6 && nextNoteMatrix?.length === 6 && points?.length >= 2, 'lyric and note geometry available');
    const endX = lineMatrix[0] * points.at(-1)[0] + lineMatrix[4];
    assert.ok(endX < nextNoteMatrix[4], 'lyric extension stops before the following E4 note');
  } else throw new Error(`Unknown fidelity case ${id}`);
}

export async function verifyFidelity(WebMscore, renderer, output, bundle) {
  // A failed/aborted run must never leave a prior run's matching failure list behind.
  await writeFile(path.join(output, 'fidelity-failures.json'), '[]\n');
  const manifestBytes = await readFile(new URL('manifest.json', fixtureDir));
  const manifest = JSON.parse(manifestBytes.toString());
  const capturePath = process.env.MS47_FIDELITY_CAPTURE && path.resolve(process.env.MS47_FIDELITY_CAPTURE);
  if (capturePath) await mkdir(capturePath); // exclusive; never overwrite a reference run
  const cases = [];
  const failures = [];
  const check = (id, stage, value, assertion = assertFidelity) => {
    try { assertion(id, value, { transposed: id === 'transposing-enharmonic' && ['edit-export', 'edited-reload'].includes(stage) }); } catch (error) { failures.push({ id, stage, message: error.message }); }
  };
  for (const fixture of manifest.cases) {
    const bytes = await readFile(new URL(fixture.file, fixtureDir));
    assert.equal(hash(bytes), fixture.sha256, `${fixture.id}: fixture hash`);
    check(fixture.id, 'input', bytes.toString());
    check(fixture.id, 'input-timing', bytes.toString(), assertFidelityTiming);
    const score = await WebMscore.load('musicxml', new Uint8Array(bytes));
    try {
      const imported = await score.saveXml();
      await writeFile(path.join(output, `${fixture.id}-imported.musicxml`), imported);
      check(fixture.id, 'import-export', imported);
      check(fixture.id, 'import-timing', imported, assertFidelityTiming);
      const svg = await score.saveSvg(0, true, false);
      await writeFile(path.join(output, `${fixture.id}-before.svg`), svg);
      check(fixture.id, 'import-render', svg, assertFidelityRendering);
      const image = await renderer.render(svg);
      if (capturePath) await writeFile(path.join(capturePath, `${fixture.id}.png`), image.png, { flag: 'wx' });
      cases.push({ id: fixture.id, file: `${fixture.id}.png`, fixtureSha256: fixture.sha256, imageSha256: hash(image.png), page: 0 });
      const pages = fixture.pages || [0];
      assert.ok(Array.isArray(pages) && pages.length > 0 && pages[0] === 0 && pages.every((page, index) => Number.isInteger(page) && page >= 0 && (index === 0 || page > pages[index - 1])), `${fixture.id}: valid ascending page list`);
      const pageCount = await score.npages();
      assert.ok(pageCount > pages.at(-1), `${fixture.id}: requested page must exist (got ${pageCount})`);
      for (const page of pages.slice(1)) {
        const pageSvg = await score.saveSvg(page, true, false);
        assert.ok(/class="Note"/.test(pageSvg), `${fixture.id}: page ${page + 1} has visible notes`);
        const pageImage = await renderer.render(pageSvg);
        const id = `${fixture.id}-page-${page + 1}`;
        if (capturePath) await writeFile(path.join(capturePath, `${id}.png`), pageImage.png, { flag: 'wx' });
        cases.push({ id, file: `${id}.png`, fixtureSha256: fixture.sha256, imageSha256: hash(pageImage.png), page });
      }
      const verifyExtraPages = async (candidate, stage) => {
        for (const page of pages.slice(1)) {
          assert.ok(await candidate.npages() > page, `${fixture.id}: ${stage} page ${page + 1} exists`);
          const pageSvg = await candidate.saveSvg(page, true, false);
          assert.equal((pageSvg.match(/class="Note"/g) || []).length, 4, `${fixture.id}: ${stage} page ${page + 1} notes`);
          await renderer.render(pageSvg);
        }
      };
      const control = await WebMscore.load('musicxml', new TextEncoder().encode(imported));
      try {
        const controlXml = await control.saveXml();
        check(fixture.id, 'control-reload', controlXml);
        check(fixture.id, 'control-timing', controlXml, assertFidelityTiming);
        const controlSvg = await control.saveSvg(0, true, false);
        await writeFile(path.join(output, `${fixture.id}-control-reload.svg`), controlSvg);
        check(fixture.id, 'control-render', controlSvg, assertFidelityRendering);
        await verifyExtraPages(control, 'control reload');
      } finally { await control.destroy(); }
      if (fixture.id === 'transposing-enharmonic') {
        assert.equal(await score.transpose(1, 0, 0, 4, true, true, false), true, 'transpose up a major second');
      } else if (fixture.id === 'dynamics-articulations' || fixture.id === 'octave-system-break') {
        const targetMeasure = fixture.id === 'octave-system-break' ? 2 : 1;
        assert.equal(await score.selectPartMeasureByIndex(0, targetMeasure), true);
        assert.equal(await score.selectNextChord(), true);
        assert.equal(await score.selectPrevChord(), true);
        const beforePitchEdit = await score.saveXml();
        assert.equal(await score.pitchUp(), true, 'note pitch edit succeeds');
        const afterPitchEdit = await score.saveXml();
        const measurePitches = xml => [...new JSDOM(xml, { contentType: 'application/xml' }).window.document.querySelectorAll('measure')]
          .map(measure => [...measure.querySelectorAll('note > pitch')].map(pitch => pitch.textContent.trim()));
        const beforePitches = measurePitches(beforePitchEdit), afterPitches = measurePitches(afterPitchEdit);
        assert.deepEqual(afterPitches.slice(0, targetMeasure), beforePitches.slice(0, targetMeasure), 'protected passage is not the edit target');
        assert.notDeepEqual(afterPitches[targetMeasure], beforePitches[targetMeasure], 'pitch edit changes the target measure');
      } else {
        assert.equal(await score.setTitleText('Fidelity edit'), true, `${fixture.id}: title edit`);
      }
      const edited = await score.saveXml();
      check(fixture.id, 'edit-export', edited);
      check(fixture.id, 'edit-timing', edited, assertFidelityTiming);
      const editedSvg = await score.saveSvg(0, true, false);
      check(fixture.id, 'edit-render', editedSvg, assertFidelityRendering);
      await renderer.render(editedSvg);
      await verifyExtraPages(score, 'edited');
      const reloaded = await WebMscore.load('musicxml', new TextEncoder().encode(edited));
      try {
        const reloadedXml = await reloaded.saveXml();
        check(fixture.id, 'edited-reload', reloadedXml);
        check(fixture.id, 'reload-timing', reloadedXml, assertFidelityTiming);
        const reloadedSvg = await reloaded.saveSvg(0, true, false);
        check(fixture.id, 'reload-render', reloadedSvg, assertFidelityRendering);
        await renderer.render(reloadedSvg);
        await verifyExtraPages(reloaded, 'edited reload');
      }
      finally { await reloaded.destroy(); }

    } finally { await score.destroy(); }
  }
  if (capturePath) {
    const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
    const wasm = bundle ? path.join(bundle, 'webmscore.lib.wasm') : path.join(process.env.MS47_ARTIFACTS || path.join(process.env.MS47_SOURCE || path.resolve('../ms47-spike'), 'build.artifacts'), 'ms47_bridge.wasm');
    const resourceRoot = process.env.MS47_RESOURCE_ROOT || path.resolve('../ms47-build-native/res');
    let systemFontsSha256 = null;
    try {
      const fontFiles = [...new Set(execFileSync('fc-list', ['--format', '%{file}\n']).toString().split('\n').filter(Boolean))];
      const configFiles = execFileSync('find', ['-L', '/etc/fonts', '-type', 'f', '-print0']).toString().split('\0').filter(Boolean);
      const digest = createHash('sha256');
      for (const file of [...new Set([...fontFiles, ...configFiles])].sort()) {
        digest.update(file).update('\0').update(createHash('sha256').update(await readFile(file)).digest());
      }
      systemFontsSha256 = digest.digest('hex');
    } catch { /* an unavailable or unreadable font inventory makes comparison fail */ }
    const metadata = { schemaVersion: 1, createdAt: new Date().toISOString(), commit: git('rev-parse', 'HEAD'),
      dirty: !!git('status', '--porcelain'), diffSha256: await gitDiffHash(),
      engineWasmSha256: hash(await readFile(wasm)), target: bundle ? 'browser-package-in-node' : 'node-harness',
      node: process.version, platform: `${os.type()} ${os.arch()}`, kernel: os.release(),
      environment: process.env.OTS_VISUAL_ENVIRONMENT || 'uncontrolled-host',
      engineDataSha256: bundle ? hash(await readFile(path.join(bundle, 'webmscore.lib.data'))) : null,
      playwright: JSON.parse(await readFile(new URL('../../node_modules/@playwright/test/package.json', import.meta.url))).version,
      browser: renderer.browserVersion, viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1,
      svgWidth: 850, background: 'white', page: 0, highlightSelection: false,
      fonts: 'fontconfig font and configuration file contents; engine data and resources recorded separately',
      systemFontsSha256, resourceRoot, resourceTreeSha256: await resourceHash(resourceRoot),
      fixtureManifestSha256: hash(manifestBytes), captureCodeSha256: hash(await readFile(new URL('./verify-fidelity.mjs', import.meta.url))),
      rendererCodeSha256: hash(await readFile(new URL('./svgcheck.mjs', import.meta.url))),
      captureDriverSha256: hash(await readFile(new URL('./capture-visual.mjs', import.meta.url))), cases, semanticFailures: failures };
    await writeFile(path.join(capturePath, 'manifest.json'), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' });
  }
  await writeFile(path.join(output, 'fidelity-failures.json'), JSON.stringify(failures, null, 2) + '\n');
  if (failures.length) {
    throw new Error(`Fidelity assertions failed: ${JSON.stringify(failures)}`);
  }
  return cases.map(({ id }) => id);
}
