#!/usr/bin/env node
// Grip edit probe (Edit Element on any element with grips): through the Node build, find the title frame, check the
// context-hit report offers Edit Element there and not on a note, enter grip editing on the frame away from its text
// (as from its context menu), drag its one grip down, and check the frame grew and that undo restores it.
// One JSON line. The Node build manages one load per process.
//
//   node scripts/grip-edit-probe.mjs    (prints JSON)
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
const score = await WebMscore.load('musicxml', fs.readFileSync(path.join(root, 'public/test_scores/eight_bars_one_voice.musicxml')));
const report = {};
const height = async () => (await score.getElementPropertyValues(['height'])).height?.value ?? null;

// The frame: scan down the page's left side (clear of the centred title) until a VBox is hit.
let at = null;
for (let y = 100; y <= 900 && !at; y += 10) {
  const hit = (await score.contextHitAtPoint(0, 400, y)).hit;
  if (hit?.type === 'VBox') at = { x: 400, y, editable: hit.editable };
}
report.frameFound = Boolean(at);
report.frameEditable = at?.editable;
await score.selectElementAtPoint(0, at.x, at.y);
report.selected = (await score.getSelectedElementProperties()).elementType;
report.heightBefore = await height();

// A note offers no Edit Element (no grips, not text).
const first = (await score.segmentPositions()).elements[0];
let noteEditable = null;
for (let dy = -40; dy <= 200 && noteEditable === null; dy += 4) {
  const hit = (await score.contextHitAtPoint(first.page, first.x + 8, first.y + dy)).hit;
  if (hit?.type === 'Note') noteEditable = hit.editable;
}
report.noteEditable = noteEditable;

await score.selectElementAtPoint(0, at.x, at.y);
const edit = await score.beginGripEdit(0, at.x, at.y);
report.grips = edit?.grips?.length ?? 0;
report.draggable = edit?.grips?.[0]?.draggable ?? false;
report.dragged = Boolean(await score.dragGrip(0, 0, 200, 0));
report.ended = await score.endGripEdit(true);
await score.selectElementAtPoint(0, at.x, at.y);
report.heightAfter = await height();
await score.undo();
await score.selectElementAtPoint(0, at.x, at.y);
report.heightAfterUndo = await height();

console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
