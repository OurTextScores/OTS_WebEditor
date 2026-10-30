#!/usr/bin/env node
// Style dialog probe (roadmap E08, docs/private/MS47_EDITOR_OPPORTUNITIES_ROADMAP.md): through the Node build,
// which generated Style-page keys the engine reads, their MuseScore defaults, and enum-typed keys (placement,
// direction, line style) written as ints and read back, then undone. One JSON line. One load per process.
//
//   node scripts/style-pages-probe.mjs    (prints JSON)
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const lib = require(path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs'));
const WebMscore = lib.default ?? lib;
await WebMscore.ready;
const pages = JSON.parse(fs.readFileSync(path.join(root, 'components/score-editor/score-dialogs/style-pages.generated.json'), 'utf8')).pages;

const log = console.log;
console.log = () => {};
const score = await WebMscore.load('musicxml', fs.readFileSync(path.join(root, 'public/test_scores/four_measures.musicxml')));
const keys = pages.flatMap((p) => p.fields.map((f) => f.key));
const values = await score.getStyleValues(keys);
const defaults = await score.getStyleDefaults(keys);
const enums = ['tupletDirection', 'pedalPlacement', 'ottavaLineStyle'];
const report = {
  total: keys.length,
  unreadable: keys.filter((k) => !(k in values)),
  withoutDefault: keys.filter((k) => k in values && !(k in defaults)),
  enumsBefore: await score.getStyleValues(enums),
  enumDefaults: await score.getStyleDefaults(enums),
  set: await score.setStyleValues({ tupletDirection: 1, pedalPlacement: 0, ottavaLineStyle: 2 }),
};
report.enumsAfter = await score.getStyleValues(enums);
report.badEnum = await score.setStyleValues({ pedalPlacement: 'above' });
await score.undo();
report.enumsAfterUndo = await score.getStyleValues(enums);

console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
