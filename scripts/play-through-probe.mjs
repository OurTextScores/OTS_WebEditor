#!/usr/bin/env node
// Performer mode's Play-through view (Phase 3), through the Node build, on public/test_scores/lyrics_repeat_volta.musicxml
// (bar 2 a first ending with an end-repeat, bar 3 the second ending): the playing order from the playback timeline,
// the bar ids of the measure positions, and the score with its repeats written out (one bar per bar played). One
// JSON line.
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
const score = await WebMscore.load(
  'musicxml',
  fs.readFileSync(path.join(root, 'public/test_scores/lyrics_repeat_volta.musicxml')),
);
const report = {};
const timeline = await score.playbackTimeline();
report.playedBars = timeline.occurrences.map((o) => o.measureIndex);
report.positionIds = (await score.measurePositions()).elements.map((e) => e.id);
const bytes = await score.unrolledMsc();
report.unrolledIsZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
const unrolled = await WebMscore.load('mscz', bytes);
report.unrolledBars = (await unrolled.measurePositions()).elements.length;
report.unrolledPlayed = (await unrolled.playbackTimeline()).occurrences.map((o) => o.measureIndex);
// The original is left as it was: its playing order unchanged
report.playedAfter = (await score.playbackTimeline()).occurrences.map((o) => o.measureIndex);
// Reflow: the engraver's line and page breaks removed (eight_bars_line_breaks.mscz: a line break after each bar)
const broken = await WebMscore.load(
  'mscz',
  fs.readFileSync(path.join(root, 'public/test_scores/eight_bars_line_breaks.mscz')),
);
report.systemsAsEngraved = (await broken.staffSystemBands()).length;
report.breaksRemoved = await broken.removeLayoutBreaks();
report.lineBreaksAfter = (await broken.measureLineBreaks()).filter(Boolean).length;
report.systemsReflowed = (await broken.staffSystemBands()).length;
console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
