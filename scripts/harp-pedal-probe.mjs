#!/usr/bin/env node
// Harp pedal probe (roadmap E21, docs/private/MS47_EDITOR_OPPORTUNITIES_ROADMAP.md): add a pedal diagram, set its
// pedals and form, undo, through the Node build. One JSON line. The Node build manages one load per process.
//
//   node scripts/harp-pedal-probe.mjs    (prints JSON)
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
const report = {};

await score.selectPartMeasureByIndex(0, 0);
await score.selectNextChord();
report.added = await score.addHarpPedalDiagram(false);
report.selected = (await score.getSelectedElementProperties()).elementType;
report.initial = await score.getHarpPedalState();
report.set = await score.setHarpPedalState({
  pedals: ['flat', 'natural', 'sharp', 'natural', 'natural', 'natural', 'flat'],
  isDiagram: false,
});
report.after = await score.getHarpPedalState();
report.badSet = await score.setHarpPedalState({ pedals: ['flat'] });
await score.undo();
report.afterUndo = await score.getHarpPedalState();

console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
