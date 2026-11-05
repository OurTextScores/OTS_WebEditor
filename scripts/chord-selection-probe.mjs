#!/usr/bin/env node
// Selection within a chord and Repeat Selection (roadmap E11), through the Node build. On
// public/test_scores/two_chords.musicxml (C4+E4, D4+F4): the note above and below in the first chord, its top and
// bottom, and refusals past either end. On public/test_scores/four_measures.musicxml: bar 1 repeated as a range over
// bar 2, and its undo. One JSON line.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = createRequire(import.meta.url)(
  path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs'),
);
const WebMscore = lib.default ?? lib;
await WebMscore.ready;
const log = console.log;
console.log = () => {};
const load = (name) =>
  WebMscore.load('musicxml', fs.readFileSync(path.join(root, 'public/test_scores', name)));
const report = {};

// The selected element: its type and its box's top (a higher note is nearer the top of the page)
const selected = async (score) => {
  const props = await score.getSelectedElementProperties();
  const box = await score.getSelectionBoundingBox();
  return { type: props?.elementType ?? null, y: box ? Math.round(box.y * 10) / 10 : null };
};

// A note of bar 1's second chord (D4+F4): past the bar to the rest after it, then back
const chords = await load('two_chords.musicxml');
await chords.selectPartMeasureByIndex(0, 0);
await chords.selectNextChord();
await chords.selectPrevChord();
report.start = await selected(chords);
report.bottom = { moved: await chords.selectNoteInChord(false, true), now: await selected(chords) };
report.bottomAgain = {
  moved: await chords.selectNoteInChord(false, true),
  now: await selected(chords),
};
report.above = { moved: await chords.selectNoteInChord(true, false), now: await selected(chords) };
report.pastTop = {
  moved: await chords.selectNoteInChord(true, false),
  now: await selected(chords),
};
report.below = { moved: await chords.selectNoteInChord(false, false), now: await selected(chords) };
report.top = { moved: await chords.selectNoteInChord(true, true), now: await selected(chords) };

// Bars as their pitches, from the MusicXML
const bars = async (score) => {
  const saved = await score.saveXml();
  const xml = typeof saved === 'string' ? saved : new TextDecoder().decode(saved);
  return [...xml.matchAll(/<measure\b[\s\S]*?<\/measure>/g)].map((m) =>
    [...m[0].matchAll(/<step>(\w)<\/step>\s*<octave>(\d)<\/octave>/g)]
      .map((n) => n[1] + n[2])
      .join(' '),
  );
};
const four = await load('four_measures.musicxml');
report.barsBefore = await bars(four);
await four.selectPartMeasureByIndex(0, 0);
report.repeated = await four.repeatSelection();
report.barsAfter = await bars(four);
await four.undo();
report.barsUndone = await bars(four);
await four.clearSelection?.();
report.repeatNothing = await four.repeatSelection();

console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
