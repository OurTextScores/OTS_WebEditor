#!/usr/bin/env node
// Time Signature Properties probe (docs/private/RIGHT_CLICK_CONTEXT_MENU_DESIGN_2026-10-28.md): read and set the
// appearance, text and beam groups of the first time signature through the Node build, and undo. One JSON line.
// The Node build manages one load per process.
//
//   node scripts/time-sig-probe.mjs    (prints JSON)
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const lib = require(path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs'));
const WebMscore = lib.default ?? lib;
await WebMscore.ready;

const log = console.log;
console.log = () => {};
const score = await WebMscore.load('musicxml', fs.readFileSync(path.join(root, 'public/test_scores/men-base.musicxml')));
const beamStarts = async () => ((await score.saveXml()).match(/<beam number="1">begin<\/beam>/g) ?? []).length;
const report = { beamsBefore: await beamStarts() };

report.none = await score.getTimeSigProperties();
// The first time signature: scan left of the first chord, over the top staff, until one is selected.
const first = (await score.segmentPositions()).elements[0];
let at = null;
for (let dx = 0; dx <= 400 && !at; dx += 8) {
  for (let dy = -40; dy <= 200 && !at; dy += 8) {
    await score.clearSelection();
    await score.selectElementAtPoint(first.page, first.x - dx, first.y + dy);
    if ((await score.getTimeSigProperties()).groups) at = { x: first.x - dx, y: first.y + dy };
  }
}
report.found = Boolean(at);
report.initial = await score.getTimeSigProperties();
// Every eighth starts a new beam: no eighth beams at all.
const eighths = report.initial.groups?.eighth ?? '';
report.set = await score.setTimeSigProperties({ type: 'normal', numeratorText: '3', denominatorText: '4', groups: { ...report.initial.groups, eighth: '1'.repeat(eighths.length) } });
report.after = await score.getTimeSigProperties();
report.beamsAfter = await beamStarts();
report.badType = await score.setTimeSigProperties({ type: 'bogus' });
await score.setTimeSigProperties({ groups: 'default' });
report.reset = (await score.getTimeSigProperties()).groups;
await score.undo();
await score.undo();
// Undo clears the selection: select the time signature again to read it.
if (at) await score.selectElementAtPoint(first.page, at.x, at.y);
report.afterUndo = await score.getTimeSigProperties();
report.beamsAfterUndo = await beamStarts();

console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
