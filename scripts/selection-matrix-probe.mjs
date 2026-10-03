#!/usr/bin/env node
// Selection behaviour matrix probe (docs/private/SELECTION_BEHAVIOR_MATRIX.md §5).
//
// For each fixture and selection kind it builds the selection through the same engine exports the editor
// uses, calls the exported action, and records what the engine did: the return value, whether the exported
// MusicXML changed, the selection afterwards. It then undoes and checks the score is back to what it was.
//
//   node scripts/selection-matrix-probe.mjs                     all fixtures, all kinds -> docs/private/selection-matrix-probe.json
//   node scripts/selection-matrix-probe.mjs --fixture f --kind k   one (fixture, kind), printed as JSON (the worker mode)
//
// The Node build of the engine loads one score per process, so the driver spawns one worker per
// (fixture, kind). Observation records the engine's behaviour, including its accidents: the matrix is a
// specification only after it has been reviewed against the desktop sources.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = [
  { file: 'three_notes_cde.musicxml', note: 'one staff, one bar, three notes' },
  { file: 'four_measures.musicxml', note: 'one staff, four bars' },
  { file: 'two_staves_four_bars.musicxml', note: 'two staves, four bars' },
  { file: 'two_chords.musicxml', note: 'chords', grid: true },
  { file: 'three_notes_slur.musicxml', note: 'an existing slur', grid: true },
];
const KINDS = ['none', 'single', 'list', 'range', 'rangeBars'];

/** One entry per action; `args` are the values the editor's own commands pass. */
const ACTIONS = [
  ['delete', 'Delete elements', (s) => s.deleteSelection()],
  ['deleteBars', 'Delete bars', (s) => s.removeSelectedMeasures()],
  ['pitchUp', 'Pitch up', (s) => s.pitchUp()],
  ['pitchDown', 'Pitch down', (s) => s.pitchDown()],
  ['transpose', 'Transpose', (s) => s.transpose(1, 0, 0, 25, true, true, true)],
  ['durationSet', 'Duration set', (s) => s.setDurationType(6)],
  ['dot', 'Dot', (s) => s.toggleDot()],
  ['accidental', 'Accidental', (s) => s.setAccidental(3)],
  ['slur', 'Slur', (s) => s.addSlur()],
  ['tie', 'Tie', (s) => s.addTie()],
  ['hairpin', 'Hairpin', (s) => s.addHairpin(0)],
  ['ottava', 'Ottava', (s) => s.addOttava(0)],
  ['trill', 'Trill', (s) => s.addTrill(0)],
  ['glissando', 'Glissando', (s) => s.addGlissando(0)],
  ['pedal', 'Pedal', (s) => s.addPedal(0)],
  ['dynamic', 'Dynamic', (s) => s.addDynamic(0)],
  ['articulation', 'Articulation', (s) => s.addArticulation('articStaccatoAbove')],
  ['fermata', 'Fermata', (s) => s.addFermata(0)],
  ['tremolo', 'Tremolo', (s) => s.addTremolo(0)],
  ['staffText', 'Staff text', (s) => s.addStaffText('probe')],
  ['clef', 'Clef', (s) => s.setClef(1)],
  ['keySignature', 'Key signature', (s) => s.setKeySignature(2)],
  ['timeSignature', 'Time signature', (s) => s.setTimeSignature(3, 4)],
  ['tuplet', 'Tuplet', (s) => s.addTuplet(3)],
  ['graceNote', 'Grace note', (s) => s.addGraceNote(0)],
  ['flip', 'Flip direction', (s) => s.flipStem()],
  ['lineBreak', 'Line break', (s) => s.toggleLineBreak()],
  ['pageBreak', 'Page break', (s) => s.togglePageBreak()],
  ['volta', 'Volta', (s) => s.addVolta(1)],
  ['repeatStart', 'Repeat start', (s) => s.toggleRepeatStart()],
  ['explode', 'Explode', (s) => s.explodeSelection()],
  ['implode', 'Implode', (s) => s.implodeSelection()],
  ['regroup', 'Regroup', (s) => s.regroupSelection()],
  ['copy', 'Copy', (s) => s.selectionMimeData()],
  ['selectNextChord', 'Select next chord', (s) => s.selectNextChord()],
  ['selectPrevChord', 'Select previous chord', (s) => s.selectPrevChord()],
  ['extendNextChord', 'Extend by chord', (s) => s.extendSelectionNextChord()],
  ['extendNextMeasure', 'Extend by measure', (s) => s.extendSelectionNextMeasure()],
  ['extendStaffBelow', 'Extend to staff below', (s) => s.extendSelectionStaffBelow()],
  // Last: undo does not fully restore the score after it (an engine finding), and later cases would start from a changed score.
  ['voice', 'Voice move', (s) => s.changeSelectedElementsVoice(1)],
];

const text = (value) => (typeof value === 'string' ? value : Buffer.from(value).toString('utf8'));
const count = (value) => (value && typeof value.length === 'number' ? value.length : value ? 1 : 0);

async function describeSelection(score) {
  const boxes = (await score.getSelectionBoundingBoxes?.()) ?? [];
  const range = Boolean(await score.isSelectionRange?.());
  const measures = range ? ((await score.selectionMeasureRange?.()) ?? null) : null;
  const sig = JSON.stringify(boxes.map((b) => [b.page, Math.round(b.x), Math.round(b.y), Math.round(b.width)]));
  return { range, boxes: boxes.length, measures, sig };
}
const kindOf = (sel) => (sel.boxes === 0 ? 'none' : sel.range ? 'range' : sel.boxes === 1 ? 'single' : 'list');

/**
 * Centre points of the first notes of the top staff. Normally found by probing near each segment; for fixtures
 * where `segmentPositions` traps in the Node build (an engine bug, recorded in the output) a coarse grid is scanned.
 */
async function findNotePoints(score, grid) {
  let candidates;
  if (grid) {
    candidates = [];
    for (let x = 500; x <= 1500; x += 10) candidates.push({ page: 0, x, y: 560 });
  } else {
    candidates = (await score.segmentPositions()).elements.slice(0, 10).map((s) => ({ page: s.page, x: s.x + 8, y: s.y }));
  }
  const points = [];
  for (const seg of candidates) {
    let found = null;
    for (let dy = -60; dy <= 260 && !found; dy += 8) {
      await score.clearSelection();
      await score.selectElementAtPoint(seg.page, seg.x, seg.y + dy);
      const boxes = await score.getSelectionBoundingBoxes();
      if (boxes.length === 1 && !(await score.isSelectionRange())) {
        const b = boxes[0];
        found = { page: b.page, x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }
    }
    if (found && !points.some((p) => Math.abs(p.x - found.x) < 4)) points.push(found);
    if (points.length >= 10) break;
  }
  await score.clearSelection();
  return points;
}

/** A point where a bar click selects a bar, found by scanning around the first notes (empty staff space). */
async function findBarPoint(score, points) {
  if (points.length < 2) return null;
  const x0 = (points[0].x + points[1].x) / 2;
  for (let dy = -140; dy <= 140; dy += 6) {
    await score.clearSelection();
    await score.selectMeasureAtPoint(0, x0, points[0].y + dy);
    if ((await score.isSelectionRange()) && (await score.selectionMeasureRange())) {
      await score.clearSelection();
      return { page: 0, x: x0, y: points[0].y + dy };
    }
  }
  await score.clearSelection();
  return null;
}

const BUILDERS = {
  none: async (score) => score.clearSelection(),
  single: async (score, p) => {
    await score.clearSelection();
    await score.selectElementAtPoint(p[0].page, p[0].x, p[0].y);
  },
  list: async (score, p) => {
    await score.clearSelection();
    await score.selectElementAtPoint(p[0].page, p[0].x, p[0].y);
    await score.selectElementAtPointWithMode(p[2].page, p[2].x, p[2].y, 1);
  },
  range: async (score, p) => {
    await score.clearSelection();
    await score.selectElementAtPoint(p[0].page, p[0].x, p[0].y);
    await score.selectElementAtPointWithMode(p[1].page, p[1].x, p[1].y, 3);
  },
  rangeBars: async (score, p, bar) => {
    await score.clearSelection();
    await score.selectMeasureAtPoint(bar.page, bar.x, bar.y);
  },
};

async function worker(fixture, kind, grid) {
  const require = createRequire(import.meta.url);
  const lib = require(path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs'));
  const WebMscore = lib.default ?? lib;
  await WebMscore.ready;
  const origLog = console.log;
  console.log = () => {}; // the engine prints debug lines
  const data = fs.readFileSync(path.join(root, 'public/test_scores', fixture));
  const score = await WebMscore.load(fixture.endsWith('.mscz') ? 'mscz' : 'musicxml', data);
  const points = await findNotePoints(score, grid);
  const bar = await findBarPoint(score, points);
  let original = text(await score.saveXml());
  const out = { fixture, kind, notes: points.length, cases: {}, aborted: null, undoMismatches: [] };
  const build = BUILDERS[kind];
  for (const [id, , run] of ACTIONS) {
    if (points.length < 3) {
      out.cases[id] = { outcome: 'unavailable', reason: 'fixture has fewer than three findable notes' };
      continue;
    }
    try {
      await build(score, points, bar);
    } catch (err) {
      out.cases[id] = { outcome: 'unavailable', reason: `selection failed: ${err.message}` };
      continue;
    }
    const before = await describeSelection(score);
    const achieved = kindOf(before);
    const wanted = kind === 'rangeBars' ? 'range' : kind;
    if (achieved !== wanted) {
      out.cases[id] = { outcome: 'unavailable', reason: `built a ${achieved} selection, not ${wanted}` };
      continue;
    }
    let ret;
    let error = null;
    try {
      ret = await run(score);
    } catch (err) {
      error = String(err.message ?? err).slice(0, 120);
    }
    const after = text(await score.saveXml());
    const changed = after !== original;
    const selAfter = await describeSelection(score);
    const result = {
      outcome: error ? 'error' : changed ? 'applied' : ret === false || ret == null ? 'refused' : 'noop',
      ret: error ? undefined : ret instanceof Uint8Array ? `bytes(${ret.length})` : ret,
      selectionAfter: kindOf(selAfter),
    };
    if (error) result.error = error;
    if (id === 'copy') result.outcome = count(ret) > 0 ? 'applied' : 'refused';
    if (/^(select|extend)/.test(id) && !error) result.outcome = selAfter.sig !== before.sig ? 'moved' : ret === false || ret == null ? 'refused' : 'noop';
    if (changed) {
      await score.undo();
      const restored = text(await score.saveXml()) === original;
      if (!restored) {
        // An engine finding in itself: record it and carry on from the state undo left behind.
        result.undoRestoresScore = false;
        out.undoMismatches.push(id);
        original = text(await score.saveXml());
      }
    }
    out.cases[id] = result;
  }
  console.log = origLog;
  process.stdout.write(`${JSON.stringify(out)}\n`);
  process.exit(0);
}

function driver() {
  const results = [];
  for (const { file, grid } of FIXTURES) {
    for (const kind of KINDS) {
      const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--fixture', file, '--kind', kind, ...(grid ? ['--grid'] : [])], {
        encoding: 'utf8',
        maxBuffer: 1 << 26,
        timeout: 300_000,
      });
      const line = run.stdout.split('\n').filter((l) => l.startsWith('{')).pop();
      if (!line) {
        results.push({ fixture: file, kind, aborted: `worker failed: ${(run.stderr || '').split('\n').slice(-3).join(' ').slice(0, 200)}`, cases: {} });
        console.error(`FAILED ${file} ${kind}`);
        continue;
      }
      results.push(JSON.parse(line));
      console.error(`ok ${file} ${kind}`);
    }
  }
  const outFile = path.join(root, 'docs/private/selection-matrix-probe.json');
  fs.writeFileSync(
    outFile,
    `${JSON.stringify({ probedAt: new Date().toISOString(), engine: 'webmscore.nodejs.cjs', actions: ACTIONS.map(([id, label]) => ({ id, label })), kinds: KINDS, fixtures: FIXTURES, results }, null, 2)}\n`,
  );
  console.error(`wrote ${path.relative(root, outFile)}`);
}

const args = process.argv.slice(2);
const arg = (name) => args[args.indexOf(`--${name}`) + 1];
if (args.includes('--fixture')) await worker(arg('fixture'), arg('kind'), args.includes('--grid'));
else driver();
