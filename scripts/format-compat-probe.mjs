#!/usr/bin/env node
// Format compatibility probe (docs/private/MSCX_FORMAT_DELTA_CHECKLIST.md).
//
// Loads one score written by a newer MuseScore through the Node build and reports what survived, read back through
// the engine's own MusicXML export: part and measure counts, key signatures (<fifths>) and text (<words>, <credit-words>).
// The Node build manages one load per process, so run one fixture per invocation.
//
//   node scripts/format-compat-probe.mjs test_scores/format-compat/<fixture>.mscz    (prints JSON)
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = process.argv[2];
if (!fixture) {
  console.error('usage: node scripts/format-compat-probe.mjs <fixture.mscz|.musicxml>');
  process.exit(2);
}

const require = createRequire(import.meta.url);
const lib = require(path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs'));
const WebMscore = lib.default ?? lib;
await WebMscore.ready;

const log = console.log;
console.log = () => {};
const data = fs.readFileSync(path.resolve(root, fixture));
const score = await WebMscore.load(fixture.endsWith('.mscz') ? 'mscz' : 'musicxml', data);
const xml = await score.saveXml();
console.log = log;

const firstPart = xml.split(/<part id=/)[1] ?? '';
const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const report = {
  fixture,
  parts: (xml.match(/<score-part /g) ?? []).length,
  measures: (firstPart.match(/<measure /g) ?? []).length,
  fifths: [...xml.matchAll(/<fifths>(-?\d+)<\/fifths>/g)].map((m) => Number(m[1])),
  words: [...xml.matchAll(/<(?:words|credit-words)[^>]*>([^<]*)<\/(?:words|credit-words)>/g)].map((m) => unescape(m[1])),
};
console.log(JSON.stringify(report));
