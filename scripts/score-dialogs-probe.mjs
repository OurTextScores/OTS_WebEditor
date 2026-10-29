#!/usr/bin/env node
// Score dialogs probe (docs/private/RIGHT_CLICK_CONTEXT_MENU_DESIGN_2026-10-28.md, Phase 4): drives the engine's
// style, Load Style, Measure Properties, Select ▸ More… and Realize Chord Symbols exports through the Node build
// and reports what each did, as one JSON line. The Node build manages one load per process.
//
//   node scripts/score-dialogs-probe.mjs    (prints JSON)
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
const read = (file) => fs.readFileSync(path.join(root, 'public/test_scores', file));
const score = await WebMscore.load('musicxml', read('four_measures.musicxml'));
const report = {};

// Style: read, set as one edit, undo.
report.styleBefore = await score.getStyleValues(['staffDistance', 'pageWidth', 'hideEmptyStaves', 'noSuchKey']);
report.styleSet = await score.setStyleValues({ staffDistance: 9, hideEmptyStaves: true });
report.styleAfter = await score.getStyleValues(['staffDistance', 'hideEmptyStaves']);
report.styleRejected = await score.setStyleValues({ staffDistance: 'wide' });
await score.undo();
report.styleUndone = await score.getStyleValues(['staffDistance', 'hideEmptyStaves']);

// Load Style: MuseJazz switches the music font, undo restores it.
report.fontBefore = (await score.getStyleValues(['musicalSymbolFont'])).musicalSymbolFont;
report.loadStyle = await score.loadStyle(new Uint8Array(read('styles/MuseJazz.mss')));
report.fontAfter = (await score.getStyleValues(['musicalSymbolFont'])).musicalSymbolFont;
await score.undo();
report.fontUndone = (await score.getStyleValues(['musicalSymbolFont'])).musicalSymbolFont;

// Measure Properties on bar 2: read, then shorten it to 3/4 and mark it excluded from the count.
await score.selectPartMeasureByIndex(0, 1);
report.measureBefore = await score.getMeasureProperties();
report.measureSet = await score.setMeasureProperties({ actual: [3, 4], irregular: true, repeatCount: 3 });
report.measureAfter = await score.getMeasureProperties();

// Select ▸ More… on the single selection: every note, then only those in bar 2.
await score.selectNextChord();
report.single = await score.getSelectedElementProperties();
report.selectAllLike = await score.selectWithOptions(-1, 0, 0, {});
report.selectAllLikeCount = (await score.getSelectedElementProperties()).selectionCount;

// Narrowed to the bar the pattern note is in; then subtracted from the selection.
await score.selectNextChord();
report.sameMeasure = await score.selectWithOptions(-1, 0, 0, { sameMeasure: true });
report.sameMeasureCount = (await score.getSelectedElementProperties()).selectionCount;

// Realize Chord Symbols: a C chord symbol on that note becomes notes (a triad more in the score).
const notesIn = (xml) => (xml.match(/<note[ >]/g) ?? []).length;
const notesBefore = notesIn(await score.saveXml());
await score.addHarmonyText(0, 'C');
await score.selectAll();
report.realize = await score.realizeChordSymbols(true, -1, -1);
report.notesAdded = notesIn(await score.saveXml()) - notesBefore;

console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
