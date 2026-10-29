#!/usr/bin/env node
// Note input probe (roadmap E11, docs/private/MS47_EDITOR_OPPORTUNITIES_ROADMAP.md): input by duration through the
// Node build. A letter sets the pitch without entering; each duration key then enters that pitch. One JSON line.
// The Node build manages one load per process.
//
//   node scripts/note-input-probe.mjs    (prints JSON)
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
const pitches = async () =>
  [...(await score.saveXml()).matchAll(/<pitch>\s*<step>([A-G])<\/step>\s*<octave>(\d+)<\/octave>\s*<\/pitch>/g)].map((m) => `${m[1]}${m[2]}`);
const report = { before: await pitches() };

await score.selectPartMeasureByIndex(0, 0);
await score.selectNextChord();
await score.setNoteEntryMode(true);
report.method = await score.setNoteEntryMethod(7);
report.letter = await score.addPitchByStep(2, false, false); // E
report.afterLetter = await pitches();
report.duration = await score.setInputDurationType(4); // quarter: enters the E
report.afterDuration = await pitches();
await score.setInputDurationType(4); // a second quarter enters it again
report.afterSecond = await pitches();

console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
