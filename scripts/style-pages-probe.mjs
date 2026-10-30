#!/usr/bin/env node
// Style dialog probe (roadmap E08, docs/private/MS47_EDITOR_OPPORTUNITIES_ROADMAP.md): through the Node build,
// which generated Style-page keys the engine reads, their MuseScore defaults, enum-typed keys (placement,
// direction, line style) written as ints, and a point offset written as [x, y], each read back, then undone. One JSON line. One load per process.
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
report.pointBefore = (await score.getStyleValues(['hairpinPosAbove'])).hairpinPosAbove;
report.pointSet = await score.setStyleValues({ hairpinPosAbove: [0.5, -4] });
report.pointAfter = (await score.getStyleValues(['hairpinPosAbove'])).hairpinPosAbove;
report.badPoint = await score.setStyleValues({ hairpinPosAbove: [1] });
await score.undo();
report.pointAfterUndo = (await score.getStyleValues(['hairpinPosAbove'])).hairpinPosAbove;
report.badEnum = await score.setStyleValues({ pedalPlacement: 'above' });
await score.undo();
report.enumsAfterUndo = await score.getStyleValues(enums);

// The Text styles page: the catalogue, every key readable, and a colour (with alpha) and an alignment written back.
const catalog = await score.getTextStyleCatalog();
const catalogKeys = catalog.flatMap((entry) => Object.values(entry.keys));
const catalogValues = await score.getStyleValues(catalogKeys);
report.textStyles = catalog.length;
report.firstTextStyle = catalog[0]?.name;
report.textStyleUnreadable = catalogKeys.filter((k) => !(k in catalogValues));
report.titleBefore = await score.getStyleValues(['titleColor', 'titleAlign']);
report.titleSet = await score.setStyleValues({ titleColor: '#FF000080', titleAlign: [0, 3] });
report.titleAfter = await score.getStyleValues(['titleColor', 'titleAlign']);
report.badColor = await score.setStyleValues({ titleColor: 'red' });

console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
