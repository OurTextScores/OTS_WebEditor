#!/usr/bin/env node
// Rich text probe (roadmap E17): through the Node build, set a staff text from MuseScore markup (bold, italic, a font
// switch, superscript), read it back from the selection's copy data, check that broken markup is repaired and that
// undo restores the text. One JSON line. The Node build manages one load per process.
//
//   node scripts/rich-text-probe.mjs    (prints JSON)
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
/** The selected text's markup: the inner XML of <text> in the copy data. */
const markup = async () => {
  const xml = new TextDecoder().decode(await score.selectionMimeData());
  return xml.match(/<text>([\s\S]*?)<\/text>/)?.[1] ?? null;
};
const select = async () => {
  const svg = await score.saveSvg(0, true);
  const [, , , , e, f] = [...svg.slice(0, svg.indexOf('class="StaffText"')).matchAll(/matrix\(([^)]*)\)/g)].at(-1)[1].split(/\s+/).map(Number);
  for (let dy = -60; dy <= 10; dy += 5) {
    for (let dx = 0; dx <= 80; dx += 5) {
      await score.clearSelection();
      await score.selectElementAtPoint(0, e + dx, f + dy);
      if ((await score.getSelectedElementProperties()).elementType === 'StaffText') return true;
    }
  }
  return false;
};

const report = {};
await score.selectPartMeasureByIndex(0, 0);
await score.selectNextChord();
await score.addStaffText('Dolce');
report.found = await select();
report.before = await markup();
report.set = await score.setSelectedTextXml('<b>Dol</b><i>ce</i> <font face="FreeSans"/>x<sup>2</sup>');
await select();
report.after = await markup();
report.repaired = await score.setSelectedTextXml('a < b & c');
await select();
report.afterRepair = await markup();
await score.undo();
await select();
report.afterUndo = await markup();

console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
