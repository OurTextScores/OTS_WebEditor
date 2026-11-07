#!/usr/bin/env node
// Performer mode Phase 7a's engine side: addElementsAt engraves stamps at musical positions. Used by
// unit/engrave-marks-engine.test.ts; prints one JSON line.
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
  'mscz',
  fs.readFileSync(path.join(root, 'public/test_scores/bach_orig.mscz')),
);
const at = (kind, subtype, tick, y) => ({ kind, subtype, staff: 0, tick, y });
const results = await score.addElementsAt([
  at('dynamic', 'mf', 0, 6),
  at('fingering', '3', 120, -1),
  at('articulation', 'stringsUpBow', 240, -2),
  at('fermata', 'fermataAbove', 1800, -2),
  at('breath', 'breathMarkComma', 1920, -1),
  at('dynamic', 'xyz', 0, 6),
  at('fingering', '1', 37, -1),
  at('accidental', 'accidentalFlat', 0, 3),
]);
const xml = new TextDecoder().decode(await score.saveMsc('mscx'));
const count = (pattern) => (xml.match(pattern) ?? []).length;
const report = {
  results,
  dynamics: count(/<Dynamic>[\s\S]*?<subtype>mf<\/subtype>/g),
  fingerings: count(/<Fingering>[\s\S]*?<text>3<\/text>/g),
  upBows: count(/<subtype>stringsUpBow<\/subtype>/g),
  fermatas: count(/<Fermata>/g),
  breaths: count(/<Breath>/g),
};
// One undo removes them all
await score.undo?.();
const undone = new TextDecoder().decode(await score.saveMsc('mscx'));
report.dynamicsAfterUndo = (undone.match(/<Dynamic>[\s\S]*?<subtype>mf<\/subtype>/g) ?? []).length;
// A courtesy sharp on an F sharp (G major): the first sixteenth whose note takes one
const fresh = await WebMscore.load(
  'mscz',
  fs.readFileSync(path.join(root, 'public/test_scores/bach_orig.mscz')),
);
for (let tick = 0; tick < 1920 * 8 && !report.courtesyTick; tick += 120) {
  for (const y of [0, 1, 2, 3, 4, 5, 6]) {
    const [result] = await fresh.addElementsAt([at('accidental', 'accidentalSharp', tick, y)]);
    if (result.ok) {
      report.courtesyTick = tick;
      break;
    }
  }
}
const courtesyXml = new TextDecoder().decode(await fresh.saveMsc('mscx'));
report.courtesyBracketed =
  /<Accidental>\s*<bracket>1<\/bracket>\s*<role>1<\/role>\s*<subtype>accidentalSharp<\/subtype>/.test(
    courtesyXml,
  );
console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
