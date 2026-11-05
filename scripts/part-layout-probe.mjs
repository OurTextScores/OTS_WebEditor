#!/usr/bin/env node
// Part layout (roadmap E18, slice 3), through the Node build: on public/test_scores/two_staves_four_bars.musicxml
// (Violin and Cello) with parts made from the instruments, what a part has of its own (style, layout breaks,
// multimeasure rests by default), which score and part synchronization properties the engine offers where (as
// MuseScore's inspector does), and an appearance change in a part unlinking the element from the score until it is
// synchronized again. One JSON line.
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
const decode = (data) => (typeof data === 'string' ? data : new TextDecoder().decode(data));
const SYNC = [
  'positionLinkedToMaster',
  'appearanceLinkedToMaster',
  'textLinkedToMaster',
  'excludeFromParts',
];

const score = await WebMscore.load(
  'musicxml',
  fs.readFileSync(path.join(root, 'public/test_scores/two_staves_four_bars.musicxml')),
);
await score.generateExcerpts();
const report = { parts: (await score.listExcerpts()).map((part) => part.name) };
const inScore = async (id, read) => {
  await score.setExcerptId(id);
  return read();
};
const offered = async () => Object.keys(await score.getElementPropertyValues(SYNC)).sort();

report.multimeasureRests = {
  score: (await inScore(-1, () => score.getStyleValues(['createMultiMeasureRests'])))
    .createMultiMeasureRests,
  part: (await inScore(1, () => score.getStyleValues(['createMultiMeasureRests'])))
    .createMultiMeasureRests,
};

await inScore(1, () => score.setStyleValues({ staffDistance: 9 }));
report.staffDistance = {
  score: (await inScore(-1, () => score.getStyleValues(['staffDistance']))).staffDistance,
  part: (await inScore(1, () => score.getStyleValues(['staffDistance']))).staffDistance,
};

await score.setExcerptId(1);
await score.selectPartMeasureByIndex(0, 1);
await score.toggleLineBreak();
const lineBreaks = async (id) =>
  (decode(await inScore(id, () => score.saveXml())).match(/new-system="yes"/g) ?? []).length;
report.lineBreaks = { part: await lineBreaks(1), score: await lineBreaks(-1) };

// Where the synchronization properties are offered: a note in the full score and in a part, a dynamic in the part.
await score.setExcerptId(-1);
await score.selectPartMeasureByIndex(1, 0);
await score.selectNextChord();
report.offered = { scoreNote: await offered() };
await score.setExcerptId(1);
await score.selectPartMeasureByIndex(0, 0);
await score.selectNextChord();
report.offered.partNote = await offered();
await score.addDynamic(5);
report.offered.partDynamic = await offered();

// Colour the dynamic in the part: it no longer follows the score's appearance, and the score keeps its own colour.
await score.setElementPropertyValue('color', '#FF0000FF');
const dynamicState = async () => {
  const values = await score.getElementPropertyValues(['appearanceLinkedToMaster', 'color']);
  return { linked: values.appearanceLinkedToMaster?.value, color: values.color?.value };
};
report.afterPartColour = await dynamicState();
const scoreMscx = decode(await inScore(-1, () => score.saveMsc('mscx')));
report.scoreDynamicColoured = /<Dynamic>(?:(?!<\/Dynamic>)[\s\S])*?<color r="255" g="0" b="0"/.test(
  scoreMscx,
);
// Synchronize it again: it takes the score's appearance back.
await score.setExcerptId(1);
await score.setElementPropertyValue('appearanceLinkedToMaster', 'true');
report.afterResync = await dynamicState();

console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
