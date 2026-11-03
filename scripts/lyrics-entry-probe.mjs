#!/usr/bin/env node
// Lyric entry probe (roadmap E17): through the Node build, type lyrics as MuseScore's keys do (hyphen, Space,
// extender, a second verse, an emptied syllable) and read them back from the MusicXML export. One JSON line.
// The Node build manages one load per process.
//
//   node scripts/lyrics-entry-probe.mjs    (prints JSON)
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const lib = require(path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs'));
const WebMscore = lib.default ?? lib;
await WebMscore.ready;

const END = 0, NEXT = 1, PREVIOUS = 2, SYLLABLE = 3, MELISMA = 4, VERSE_UP = 5, NEW_VERSE = 7;
const log = console.log;
console.log = () => {};
const score = await WebMscore.load('musicxml', fs.readFileSync(path.join(root, 'public/test_scores/eight_bars_one_voice.musicxml')));
/** Each note's lyrics as "verse:syllabic:text[+extend]", in score order. */
const lyrics = async () =>
  [...(await score.saveXml()).matchAll(/<note[\s\S]*?<\/note>/g)]
    .map((note) =>
      [...note[0].matchAll(/<lyric number="(\d+)"[^>]*>([\s\S]*?)<\/lyric>/g)].map((m) => {
        const syllabic = m[2].match(/<syllabic>(\w+)<\/syllabic>/)?.[1] ?? '-';
        const text = m[2].match(/<text>([^<]*)<\/text>/)?.[1] ?? '';
        return `${m[1]}:${syllabic}:${text}${/<extend/.test(m[2]) ? '+extend' : ''}`;
      }),
    )
    .filter((l) => l.length)
    .map((l) => l.join(' | '));

const report = {};
await score.selectPartMeasureByIndex(0, 0);
await score.selectNextChord();
report.start = await score.startLyricsEntry();
const steps = [];
const step = async (text, action) => {
  const at = await score.lyricsEntryCommit(text, action);
  steps.push(at ? { x: Math.round(at.x), verse: at.verse, text: at.text } : null);
  return at;
};
await step('Hel', SYLLABLE);
await step('lo', NEXT);
await step('world', MELISMA);   // "_" once per further note the syllable is sung over (MuseScore)
await step('', MELISMA);
await step('ah', NEXT);
await step('sing', NEW_VERSE);
await step('two', VERSE_UP);
const back = await step('sing', PREVIOUS);   // retype the same syllable, then go back a note
report.backText = back?.text;
await step(back?.text ?? '', END);   // the box shows the syllable already there; Escape keeps it
report.steps = steps;
report.lyrics = await lyrics();

// Emptying a syllable removes it.
await score.selectPartMeasureByIndex(0, 0);
await score.selectNextChord();
await score.startLyricsEntry();
await score.lyricsEntryCommit('', END);
report.afterEmptying = await lyrics();
await score.undo();
report.afterUndo = await lyrics();

console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
