#!/usr/bin/env node
// Managing parts (roadmap E18, slice 4), through the Node build: on public/test_scores/two_staves_four_bars.musicxml
// (Violin and Cello) with parts made from the instruments, a part of both instruments created, renamed (an empty or
// taken name refused), duplicated, reset (dropping its own style) and deleted, each one undoable edit; then parts put
// back on a fresh load (restoreExcerpts), with no undo step. One JSON line.
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
  fs.readFileSync(path.join(root, 'public/test_scores/two_staves_four_bars.musicxml')),
);
await score.generateExcerpts();
const names = async () => (await score.listExcerpts()).map((part) => part.name);
const report = { generated: await names() };

report.created = await score.createExcerpt('Strings', [1, 0]);
report.afterCreate = await score.listExcerpts();
report.createNone = await score.createExcerpt('Empty', []);
report.createOffScore = await score.createExcerpt('Off', [5]);
report.createTaken = await score.createExcerpt('Violin', [0]);
report.afterTaken = await names();
await score.removeExcerpt(3);

report.renameEmpty = await score.renameExcerpt(2, '  ');
report.renameTaken = await score.renameExcerpt(2, 'cello');
report.renamed = await score.renameExcerpt(2, 'Strings duo');
report.afterRename = await names();

report.duplicated = await score.duplicateExcerpt(0);
report.afterDuplicate = await names();

// Reset: the part's own style goes, the part stays where it is.
await score.setExcerptId(1);
await score.setStyleValues({ staffDistance: 9 });
const before = (await score.getStyleValues(['staffDistance'])).staffDistance;
await score.setExcerptId(-1);
report.reset = await score.resetExcerpt(1);
await score.setExcerptId(1); // the part reset, in its place
report.resetStyle = {
  before,
  after: (await score.getStyleValues(['staffDistance'])).staffDistance,
};
await score.setExcerptId(-1);
report.afterReset = await names();

report.removed = await score.removeExcerpt(1);
report.afterRemove = await names();
// Undo the removal: the part comes back.
await score.undo();
report.afterUndo = await names();

// Parts put back as part of loading (slice 5), on a fresh load: no undo step; a part with no instrument here skipped.
const reloaded = await WebMscore.load(
  'musicxml',
  fs.readFileSync(path.join(root, 'public/test_scores/two_staves_four_bars.musicxml')),
);
report.restored = await reloaded.restoreExcerpts([
  { name: 'Cello', parts: [1] },
  { name: 'Gone', parts: [7] },
  { name: 'Duo', parts: [1, 0, 1] },
]);
report.afterRestore = await reloaded.listExcerpts();
report.restoreUndoSize = (await reloaded.getUndoInfo()).size;

console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
