#!/usr/bin/env node
// Text properties probe (the Properties panel's Text section): through the Node build, add a staff text, select it,
// read its text properties, set font, size, style flags, alignment, frame colour and text style, and reset one.
// One JSON line. The Node build manages one load per process.
//
//   node scripts/text-properties-probe.mjs    (prints JSON)
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
const score = await WebMscore.load('musicxml', fs.readFileSync(path.join(root, 'public/test_scores/four_measures.musicxml')));
const NAMES = ['style', 'family', 'size', 'fontStyle', 'sizeIsSpatiumDependent', 'align', 'frameType', 'frameBgColor', 'frameWidth'];
const read = async () => {
  const values = await score.getElementPropertyValues(NAMES);
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.value]));
};
const report = {};

await score.selectPartMeasureByIndex(0, 0);
await score.selectNextChord();
report.added = await score.addStaffText('Dolce');
// The new text: its glyphs' transform in the page SVG (page units, as selection uses), then a small scan there.
const svg = await score.saveSvg(0, true);
const [, , , , e, f] = [...svg.slice(0, svg.indexOf('class="StaffText"')).matchAll(/matrix\(([^)]*)\)/g)]
  .at(-1)[1]
  .split(/\s+/)
  .map(Number);
let found = false;
for (let dy = -60; dy <= 10 && !found; dy += 5) {
  for (let dx = 0; dx <= 80 && !found; dx += 5) {
    await score.clearSelection();
    await score.selectElementAtPoint(0, e + dx, f + dy);
    found = (await score.getSelectedElementProperties()).elementType === 'StaffText';
  }
}
report.found = found;
report.before = await read();
report.defaults = Object.fromEntries(Object.entries(await score.getElementPropertyValues(['family', 'size'])).map(([k, v]) => [k, v.default]));
const set = async (name, token) => score.setElementPropertyValue(name, token, false);
report.sets = {
  family: await set('family', 'FreeSans'),
  size: await set('size', '14'),
  fontStyle: await set('fontStyle', '3'),
  align: await set('align', 'center,bottom'),
  frameType: await set('frameType', '1'),
  frameBgColor: await set('frameBgColor', '#FFFF0080'),
  badColor: await set('frameBgColor', 'yellow'),
  badAlign: await set('align', 'middle'),
};
report.after = await read();
report.reset = await score.setElementPropertyValue('size', '', true);
report.afterReset = (await read()).size;
report.styleChange = await set('style', 'expression');
report.afterStyle = await read();

console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
