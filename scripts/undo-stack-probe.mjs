#!/usr/bin/env node
// Undo stack probe (docs/private/UNDO_HISTORY_PANEL_DESIGN_2026-10-04.md §7, H0).
//
// Drives the Node build through typical edits and records what the engine's undo stack does: how many
// entries each operation adds, what the entries say, whether a new edit after an undo drops the redo tail,
// and what jumping several steps costs.
//
//   node scripts/undo-stack-probe.mjs [fixture]    (default four_measures.musicxml; prints JSON)
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = process.argv[2] ?? 'four_measures.musicxml';
const require = createRequire(import.meta.url);
const lib = require(path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs'));
const WebMscore = lib.default ?? lib;
await WebMscore.ready;
const log = console.log;
console.log = () => {};
const score = await WebMscore.load(fixture.endsWith('.mscz') ? 'mscz' : 'musicxml', fs.readFileSync(path.join(root, 'public/test_scores', fixture)));
const report = { fixture, steps: [] };

/** A point on a note: scan down from the first segments until a single element is selected. */
async function notePoint() {
  const segments = (await score.segmentPositions()).elements.slice(0, 10);
  for (const seg of segments) {
    for (let dy = -60; dy <= 260; dy += 8) {
      await score.clearSelection();
      await score.selectElementAtPoint(seg.page, seg.x + 8, seg.y + dy);
      const boxes = await score.getSelectionBoundingBoxes();
      if (boxes.length === 1 && !(await score.isSelectionRange())) {
        const b = boxes[0];
        return { page: b.page, x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }
    }
  }
  throw new Error('no note found');
}
const info = () => score.getUndoInfo();
async function step(name, run) {
  const before = await info();
  const started = performance.now();
  let result;
  try {
    result = await run();
  } catch (error) {
    result = `threw: ${String(error.message ?? error).slice(0, 80)}`;
  }
  const after = await info();
  const entries = after.size > before.size ? await score.getUndoEntries(before.size, after.size) : [];
  report.steps.push({ name, result, before, after, added: after.size - before.size, ms: Math.round(performance.now() - started), entries });
}

report.initial = await info();
const point = await notePoint();
await score.selectElementAtPoint(point.page, point.x, point.y);
await step('pitchUp', () => score.pitchUp());
await step('pitchUp again', () => score.pitchUp());
await step('addDynamic', () => score.addDynamic(0));
await step('addArticulation', () => score.addArticulation('articStaccatoAbove'));
await step('addSlur', () => score.addSlur());
await step('setDurationType', () => score.setDurationType(6));
await step('undo', () => score.undo());
await step('redo', () => score.redo());
await step('undo x2', async () => { await score.undo(); await score.undo(); });
await step('new edit after undo (drops the tail)', () => score.addDynamic(3));
const beforeJump = await info();
const t0 = performance.now();
const reached = await score.undoRedoTo(0);
report.jump = { from: beforeJump.index, to: 0, reached, ms: Math.round(performance.now() - t0), after: await info() };
const t1 = performance.now();
const back = await score.undoRedoTo(beforeJump.index);
report.jumpBack = { reached: back, ms: Math.round(performance.now() - t1), after: await info() };
console.log = log;
console.log(JSON.stringify(report, null, 2));
