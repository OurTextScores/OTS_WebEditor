#!/usr/bin/env node
// Range drop (roadmap E11), through the Node build, on public/test_scores/four_measures.musicxml (F4, A4, C5, E5):
// bar 1 selected, the preview and the drop at bar 3's note (keeping the bar alignment), its undo; refusals without a
// range and off the music. One JSON line.
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
  fs.readFileSync(path.join(root, 'public/test_scores/four_measures.musicxml')),
);
const bars = async () => {
  const saved = await score.saveXml();
  const xml = typeof saved === 'string' ? saved : new TextDecoder().decode(saved);
  return [...xml.matchAll(/<measure\b[\s\S]*?<\/measure>/g)].map((m) =>
    [...m[0].matchAll(/<step>(\w)<\/step>\s*<octave>(\d)<\/octave>/g)]
      .map((n) => n[1] + n[2])
      .join(' '),
  );
};
const report = { barsBefore: await bars() };

// Bar 3's note, as a page point: select it and read its box
await score.selectPartMeasureByIndex(0, 2);
await score.selectNextChord();
await score.selectPrevChord();
const box = await score.getSelectionBoundingBox();
const at = { page: box.page, x: box.x + box.width / 2, y: box.y + box.height / 2 };

await score.clearSelection();
report.previewWithoutRange = await score.rangeDropPreview(at.page, at.x, at.y, true);
report.dropWithoutRange = await score.dropRangeAt(at.page, at.x, at.y, true);

await score.selectPartMeasureByIndex(0, 0);
const preview = await score.rangeDropPreview(at.page, at.x, at.y, true);
report.preview = preview.map((b) => ({
  page: b.page,
  right: b.x + b.width > at.x,
  left: b.x <= at.x,
}));
report.previewOffMusic = await score.rangeDropPreview(at.page, -500, -500, true);
report.dropped = await score.dropRangeAt(at.page, at.x, at.y, true);
report.barsAfter = await bars();
await score.undo();
report.barsUndone = await bars();

console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
