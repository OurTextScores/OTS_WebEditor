#!/usr/bin/env node
// Element properties probe (roadmap E09/E07/E10, docs/private/MS47_EDITOR_OPPORTUNITIES_ROADMAP.md): adds an ornament,
// a dynamic and a hairpin through the Node build and reads and writes their typed properties by MuseScore property
// name, reporting what happened as one JSON line. The Node build manages one load per process.
//
//   node scripts/element-properties-probe.mjs    (prints JSON)
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
const data = fs.readFileSync(path.join(root, 'public/test_scores/four_measures.musicxml'));
const score = await WebMscore.load('musicxml', data);
const report = {};

const NAMES = ['intervalAbove', 'ornamentShowAccidental', 'ornamentShowCueNote', 'startOnUpperNote',
  'voiceAssignment', 'centerBetweenStaves', 'centerOnNotehead', 'noSuchProperty'];

// A turn on bar 1's note, a forte on bar 2's, a crescendo hairpin from bar 3's.
await score.selectPartMeasureByIndex(0, 0);
await score.selectNextChord();
report.ornamentAdded = await score.addArticulation('ornamentTurn');
await score.selectPartMeasureByIndex(0, 1);
await score.selectNextChord();
await score.addDynamic(6);
await score.selectPartMeasureByIndex(0, 2);
await score.selectNextChord();
await score.addHairpin(0);

await score.selectAll();
report.before = await score.getElementPropertyValues(NAMES);
report.setInterval = await score.setElementPropertyValue('intervalAbove', 'third,minor');
report.setVoice = await score.setElementPropertyValue('voiceAssignment', 'currentVoiceOnly');
report.rejected = await score.setElementPropertyValue('voiceAssignment', 'everywhere');
report.unknown = await score.setElementPropertyValue('noSuchProperty', 'x');
report.after = await score.getElementPropertyValues(['intervalAbove', 'voiceAssignment']);
report.reset = await score.setElementPropertyValue('intervalAbove', '', true);
report.afterReset = await score.getElementPropertyValues(['intervalAbove']);
await score.undo();
report.undone = await score.getElementPropertyValues(['intervalAbove']);

console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
