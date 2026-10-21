// Run the unmodified score wrappers and WasmRes reader against the 4.7 module.
import assert from 'node:assert/strict';
import { createSvgRenderer } from './svgcheck.mjs';
import { verifyEdits } from './verify-edits.mjs';
import { verifyTimeline } from './verify-timeline.mjs';
import { verifyMeasures } from './verify-measures.mjs';
import { verifySpanners } from './verify-spanners.mjs';
import { verifyParts } from './verify-parts.mjs';
import { verifyMisc } from './verify-misc.mjs';
import { verifyDrag } from './verify-drag.mjs';
import { verifyMidi } from './verify-midi.mjs';
import { verifyNoteInput } from './verify-noteinput.mjs';
import { verifySelection } from './verify-selection.mjs';
import { verifyInspector } from './verify-inspector.mjs';
import { mkdtemp, readFile, writeFile, copyFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const workspace = path.dirname(repo);
const build = process.env.MS47_SOURCE || path.join(workspace, 'ms47-spike');
process.env.MS47_RESOURCE_ROOT ||= path.join(workspace, 'ms47-build-native/res');
const output = path.resolve(process.env.MS47_OUTPUT || '/tmp/ms47-bridge-results');
await mkdir(output, { recursive: true });
const temp = await mkdtemp(path.join(tmpdir(), 'ms47-bridge-'));
let renderer;
try {
  const bridge = path.join(repo, 'webmscore-fork/web-public/src');
  await writeFile(path.join(temp, 'package.json'), '{"type":"module"}');
  await copyFile(path.join(build, 'build.artifacts/ms47_bridge.js'), path.join(temp, 'engine.cjs'));
  await copyFile(path.join(build, 'build.artifacts/ms47_bridge.wasm'), path.join(temp, 'ms47_bridge.wasm'));
  for (const name of ['index.js', 'utils.js']) await copyFile(path.join(bridge, name), path.join(temp, name));
  await writeFile(path.join(temp, 'engine-adapter.js'), `
import Engine from './engine.cjs';
import { readFileSync } from 'node:fs';
export default options => Engine({ ...options, wasmBinary: readFileSync(new URL('./ms47_bridge.wasm', import.meta.url)) });
`);
  const helper = (await readFile(path.join(bridge, 'helper.js'), 'utf8')).replace("'../webmscore.lib.js'", "'./engine-adapter.js'");
  // helper.js still uses Node require() for asset lookup; supply the Node global
  // that webpack normally supplies. Everything else, including init, is intact.
  globalThis.require = createRequire(path.join(temp, 'helper.js'));
  await writeFile(path.join(temp, 'helper.js'), helper);
  const started = performance.now();
  const { default: WebMscore } = await import(pathToFileURL(path.join(temp, 'index.js')));
  await WebMscore.ready;
  const bootMs = performance.now() - started;
  assert.equal(await WebMscore.version(), 470);
  const scores = process.argv.slice(2);
  if (!scores.length && !process.env.MS47_ONLY_EDITS) scores.push('public/test_scores/three_notes_cde.musicxml', 'public/test_scores/bach_orig.mscz');
  function pitches(xml) {
    const semitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    return [...xml.matchAll(/<pitch>([\s\S]*?)<\/pitch>/g)].map(([, p]) => {
      const step = p.match(/<step>([A-G])<\/step>/)?.[1];
      const octave = Number(p.match(/<octave>(-?\d+)<\/octave>/)?.[1]);
      const alter = Number(p.match(/<alter>(-?[\d.]+)<\/alter>/)?.[1] || 0);
      return (octave + 1) * 12 + semitones[step] + alter;
    });
  }
  renderer = await createSvgRenderer();
  const results = [];
  for (const [i, name] of scores.entries()) {
    const times = {};
    async function timed(exportName, action) {
      const t = performance.now();
      const result = await action();
      (times[exportName] ||= []).push(performance.now() - t);
      return result;
    }
    const bytes = new Uint8Array(await readFile(path.resolve(repo, name)));
    const format = path.extname(name).slice(1);
    const score = await timed('load', () => WebMscore.load(format, bytes));
    try {
      assert.equal(await score.pitchUp(), false, 'Pitch command must reject an empty selection');
      const initialUndo = await score.getUndoInfo();
      const pageCount = await score.npages();
      assert.ok(pageCount >= 1);
      assert.ok(await score.getSpatium() > 0);
      const xmlBefore = await timed('saveXml', () => score.saveXml());
      assert.match(xmlBefore, /<note[ >]/);
      const svgBefore = await timed('saveSvg', () => score.saveSvg());
      assert.match(svgBefore, /^<svg /);
      assert.match(svgBefore, /<(path|polygon|polyline)/);
      assert.match(svgBefore, /<text /);
      const beforeImage = await renderer.render(svgBefore);
      await writeFile(path.join(output, `${i}-before.png`), beforeImage.png);
      await writeFile(path.join(output, `${i}-before.svg`), svgBefore);
      await writeFile(path.join(output, `${i}-before.musicxml`), xmlBefore);
      assert.equal(await timed('selectPartMeasureByIndex', () => score.selectPartMeasureByIndex(0, 0)), true);
      // Selection must not change printing output.
      assert.ok((await renderer.render(await score.saveSvg())).png.equals(beforeImage.png), 'Selection must not change printed pixels');
      assert.equal(await timed('pitchUp', () => score.pitchUp()), true);
      assert.equal((await score.getUndoInfo()).index, initialUndo.index + 1);
      const xmlAfter = await timed('saveXml', () => score.saveXml());
      assert.notEqual(xmlAfter, xmlBefore, 'Pitch command must change MusicXML');
      const beforePitches = pitches(xmlBefore), afterPitches = pitches(xmlAfter);
      assert.equal(afterPitches.length, beforePitches.length);
      const deltas = afterPitches.map((p, i) => p - beforePitches[i]);
      assert.ok(deltas.some(d => d === 1), 'At least one pitch must rise a semitone');
      assert.ok(deltas.every(d => d === 0 || d === 1), 'Other pitches must stay unchanged');
      const svgAfter = await timed('saveSvg', () => score.saveSvg());
      assert.notEqual(svgAfter, svgBefore, 'Pitch command must change SVG');
      const afterImage = await renderer.render(svgAfter);
      assert.notDeepEqual(afterImage.png, beforeImage.png, 'Pitch must visibly change the score');
      await writeFile(path.join(output, `${i}-after.png`), afterImage.png);
      await writeFile(path.join(output, `${i}-after.svg`), svgAfter);
      await writeFile(path.join(output, `${i}-after.musicxml`), xmlAfter);
      assert.equal(await timed('undo', () => score.undo()), true);
      assert.equal(await score.saveXml(), xmlBefore, 'Undo must restore MusicXML exactly');
      const undoneSvg = await score.saveSvg();
      await writeFile(path.join(output, `${i}-undo.svg`), undoneSvg);
      const undoImage = await renderer.render(undoneSvg);
      await writeFile(path.join(output, `${i}-undo.png`), undoImage.png);
      assert.ok(undoImage.png.equals(beforeImage.png), 'Undo must restore pixels exactly');
      assert.equal(await timed('redo', () => score.redo()), true);
      assert.equal(await score.saveXml(), xmlAfter, 'Redo must restore mutated MusicXML');
      const redoImage = await renderer.render(await score.saveSvg());
      assert.ok(redoImage.png.equals(afterImage.png), 'Redo must restore pixels exactly');
      assert.equal(await score.undoRedoTo(initialUndo.index), true);
      assert.equal(await score.saveXml(), xmlBefore);
      assert.equal(await score.undoRedoTo(initialUndo.index + 1), true);
      assert.equal(await score.saveXml(), xmlAfter);
      // Save/read both native formats through the existing wrappers.
      for (const nativeFormat of ['mscz', 'mscx']) {
        const saved = await timed('saveMsc:' + nativeFormat, () => score.saveMsc(nativeFormat));
        assert.ok(saved.length > 0);
        if (nativeFormat === 'mscx') {
          const raw = new TextDecoder().decode(saved);
          assert.match(raw, /<museScore\b/);
          assert.doesNotMatch(raw, /<files>/, 'MSCX must be a standalone score, not an MSCS container');
          assert.match(raw, /<Style>/, 'Standalone MSCX retains native style settings');
        }
        const reloaded = await timed('reload:' + nativeFormat, () => WebMscore.load(nativeFormat, saved));
        try {
          assert.deepEqual(pitches(await reloaded.saveXml()), afterPitches);
          assert.equal(await reloaded.npages(), pageCount);
          const roundTripSvg = await reloaded.saveSvg();
          const roundTripImage = await renderer.render(roundTripSvg);
          await writeFile(path.join(output, `${i}-${nativeFormat}-reload.svg`), roundTripSvg);
          await writeFile(path.join(output, `${i}-${nativeFormat}-reload.png`), roundTripImage.png);
          await writeFile(path.join(output, `${i}-${nativeFormat}-reload.musicxml`), await reloaded.saveXml());
          assert.ok(roundTripImage.png.equals(afterImage.png), `${name}: ${nativeFormat} round trip preserves printed pixels`);
        } finally { reloaded.destroy(); }
      }
      // Escaping, header creation and engine undo must work together.
      const title = 'Bridge <title> & "quotes"';
      assert.equal(await score.setTitleText(title), true);
      assert.equal(await score.title(), title);
      assert.equal(await score.undo(), true);
      assert.equal(await score.saveXml(), xmlAfter);
      const oldMode = await score.getLayoutMode();
      assert.equal(await score.setLayoutMode(-1), false);
      assert.equal(await score.setLayoutMode(100), false);
      assert.equal(await score.relayout(), true);
      assert.equal(await score.getLayoutMode(), oldMode);
      assert.ok((await renderer.render(await score.saveSvg())).png.equals(afterImage.png));
      assert.equal(await score.clearSelection(), true);
      assert.equal(await score.pitchDown(), false);
      assert.equal(await score.selectAll(), true);
      assert.equal(await score.isSelectionRange(), true);
      assert.equal(await score.selectPartMeasureByIndex(-1, 0), false);
      assert.equal(await score.selectPartMeasureByIndex(0, -1), false);
      assert.equal(await score.selectPartMeasureByIndex(0, 999999), false);
      assert.equal(await score.clearSelection(), true);
      await assert.rejects(score.saveSvg(-1), /Invalid/);
      await assert.rejects(score.saveSvg(999999), /Invalid/);
      results.push({ score: name, bytes: bytes.length, svgBytes: Buffer.byteLength(svgBefore), times });
    } finally {
      await timed('destroy', () => score.destroy());
    }
  }
  await assert.rejects(WebMscore.load('invalid', new Uint8Array()), /Unsupported/);
  const edits = process.env.MS47_VERIFY_EDITS ? await verifyEdits(WebMscore, renderer, output) : undefined;
  const inspector = process.env.MS47_VERIFY_INSPECTOR ? await verifyInspector(WebMscore) : undefined;
  const selection = process.env.MS47_VERIFY_SELECTION ? await verifySelection(WebMscore, renderer, (await import(pathToFileURL(path.join(temp, 'helper.js')))).Module) : undefined;
  const noteInput = process.env.MS47_VERIFY_NOTEINPUT ? await verifyNoteInput(WebMscore, renderer, (await import(pathToFileURL(path.join(temp, 'helper.js')))).Module) : undefined;
  const measures = process.env.MS47_VERIFY_MEASURES ? await verifyMeasures(WebMscore, renderer, output, (await import(pathToFileURL(path.join(temp, 'helper.js')))).Module) : undefined;
  const timeline = process.env.MS47_VERIFY_MEASURES || process.env.MS47_VERIFY_TIMELINE ? await verifyTimeline(WebMscore, (await import(pathToFileURL(path.join(temp, 'helper.js')))).Module) : undefined;
  const spanners = process.env.MS47_VERIFY_SPANNERS ? await verifySpanners(WebMscore, renderer, output) : undefined;
  const misc = process.env.MS47_VERIFY_MISC ? await verifyMisc(WebMscore, renderer) : undefined;
  const drag = process.env.MS47_VERIFY_DRAG ? await verifyDrag(WebMscore, renderer) : undefined;
  const midi = process.env.MS47_VERIFY_MIDI ? await verifyMidi(WebMscore) : undefined;
  // Last: addFont changes global font state
  const parts = process.env.MS47_VERIFY_PARTS ? await verifyParts(WebMscore, renderer, output) : undefined;
  const cache = await readFile(path.join(process.env.MS47_BUILD || path.join(workspace, 'ms47-build-wasm'), 'CMakeCache.txt'), 'utf8');
  const wasm = await readFile(path.join(temp, 'ms47_bridge.wasm'));
  const report = { bootMs, results, edits, inspector, selection, noteInput, measures, timeline, spanners, misc, drag, midi, parts, build: { node: process.version, fastLink: /^MS47_BRIDGE_FAST_LINK:BOOL=ON$/m.test(cache), wasmBytes: wasm.length, wasmSha256: createHash('sha256').update(wasm).digest('hex') } };
  await writeFile(path.join(output, 'timings.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (renderer) await renderer.close();
  await rm(temp, { recursive: true, force: true });
}
