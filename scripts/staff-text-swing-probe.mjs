#!/usr/bin/env node
// Staff/System Text Properties probe (docs/private/RIGHT_CLICK_CONTEXT_MENU_DESIGN_2026-10-28.md): add a system
// text, set its swing, and check the playback (the MIDI export) changes and undo restores it, through the Node
// build. One JSON line. The Node build manages one load per process.
//
//   node scripts/staff-text-swing-probe.mjs    (prints JSON)
import crypto from 'node:crypto';
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
const midi = async () => crypto.createHash('sha1').update(await score.saveMidi(false, false)).digest('hex');
const report = { none: await score.getStaffTextSwing() };

await score.selectPartMeasureByIndex(0, 0);
await score.selectNextChord();
report.added = await score.addSystemText('Swing');
report.midiBefore = await midi();

// The new text: its glyphs' transform in the page SVG (the same page units as selection), then a small scan there.
const svg = await score.saveSvg(0, true);
const [, , , , e, f] = [...svg.slice(0, svg.indexOf('class="SystemText"')).matchAll(/matrix\(([^)]*)\)/g)]
  .at(-1)[1]
  .split(/\s+/)
  .map(Number);
let at = null;
for (let dy = -60; dy <= 10 && !at; dy += 5) {
  for (let dx = 0; dx <= 80 && !at; dx += 5) {
    await score.clearSelection();
    await score.selectElementAtPoint(0, e + dx, f + dy);
    if ((await score.getStaffTextSwing()).system !== undefined) at = { x: e + dx, y: f + dy };
  }
}
report.found = Boolean(at);
report.initial = await score.getStaffTextSwing();
report.set = await score.setStaffTextSwing({ swing: true, unit: 'eighth', ratio: 66 });
report.after = await score.getStaffTextSwing();
report.midiAfter = await midi();
report.badUnit = await score.setStaffTextSwing({ swing: true, unit: 'quarter', ratio: 66 });
await score.undo();
report.midiAfterUndo = await midi();

console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
