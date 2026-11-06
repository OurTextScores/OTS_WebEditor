#!/usr/bin/env node
// Writes public/test_scores/two_staves_parts.mscz: two_staves_four_bars.musicxml (Violin and Cello) with a part per
// instrument, for tests that need a score that already has parts (performer mode's part choice).
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
const parts = (await score.listExcerpts()).map((part) => part.name);
const bytes = await score.saveMsc('mscz');
fs.writeFileSync(path.join(root, 'public/test_scores/two_staves_parts.mscz'), Buffer.from(bytes));
console.log = log;
console.log(JSON.stringify({ parts, bytes: bytes.length }));
process.exit(0);
