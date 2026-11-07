#!/usr/bin/env node
// Writes public/test_scores/eight_bars_line_breaks.mscz: eight_bars_one_voice.musicxml with a line break after every
// bar (eight systems as engraved), for performer mode's reflow, which ignores the engraver's breaks.
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
  fs.readFileSync(path.join(root, 'public/test_scores/eight_bars_one_voice.musicxml')),
);
const bars = (await score.measureLineBreaks()).length;
await score.setMeasureLineBreaks(Array.from({ length: bars }, (_, index) => index < bars - 1));
const breaks = await score.measureLineBreaks();
const bytes = await score.saveMsc('mscz');
fs.writeFileSync(
  path.join(root, 'public/test_scores/eight_bars_line_breaks.mscz'),
  Buffer.from(bytes),
);
console.log = log;
console.log(JSON.stringify({ bars, breaks, bytes: bytes.length }));
process.exit(0);
