#!/usr/bin/env node
// segmentPositions probe: does the engine's note-level position export work on a score, and what widths does it give?
// It used to trap ("function signature mismatch") on most real scores and report a width of 0 on all of them; this is the
// check that it does neither (docs/private/PLAYBACK notes, feat/player-note-highlight review).
//
//   for f in public/test_scores/*.musicxml test_scores/*.mscz; do node scripts/segment-positions-probe.mjs "$f"; done
//
// The Node build loads one score per process, hence one file per run.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2];
const require = createRequire(import.meta.url);
const lib = require(path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs'));
const W = lib.default ?? lib;
await W.ready;
const log = console.log;
console.log = () => {};
const data = fs.readFileSync(file);
try {
  const score = await W.load(file.endsWith('.mscz') ? 'mscz' : 'musicxml', data);
  const seg = await score.segmentPositions();
  const widths0 = seg.elements.filter((e) => !((e.width ?? e.sx) > 0)).length;
  const w = seg.elements.map((e) => e.width ?? e.sx).sort((a, b) => a - b);
  console.log = log;
  console.log(
    'OK',
    path.basename(file),
    'elements',
    seg.elements.length,
    'events',
    seg.events.length,
    'zeroWidth',
    widths0,
    'width min/median/max',
    Math.round(w[0]),
    Math.round(w[w.length >> 1]),
    Math.round(w[w.length - 1]),
  );
} catch (e) {
  console.log = log;
  console.log('FAIL', path.basename(file), String(e.message ?? e).slice(0, 60));
}
