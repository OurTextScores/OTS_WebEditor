#!/usr/bin/env node
// Lyrics across a repeat jump (roadmap E17): through the Node build, on a score whose bar 2 is a 1st ending closing a
// repeat and bar 3 the 2nd ending, a hyphen at the end of the 1st ending stays a dash into the repeat, and a hyphen at
// the start of the 2nd ending makes an incoming partial dash, as in MuseScore. One JSON line.
//
//   node scripts/lyrics-repeat-probe.mjs    (prints JSON)
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const lib = require(path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs'));
const WebMscore = lib.default ?? lib;
await WebMscore.ready;

const END = 0, SYLLABLE = 3, MELISMA = 4, NEW_VERSE = 7;
const log = console.log;
console.log = () => {};
const score = await WebMscore.load('musicxml', fs.readFileSync(path.join(root, 'public/test_scores/lyrics_repeat_volta.musicxml')));
/** "measure:verse:syllabic:text" for each lyric. */
const lyrics = async () => {
  const xml = await score.saveXml();
  return [...xml.matchAll(/<measure number="(\d+)"[\s\S]*?<\/measure>/g)].flatMap((m) =>
    [...m[0].matchAll(/<lyric number="(\d+)"[^>]*>([\s\S]*?)<\/lyric>/g)].map(
      (l) => `${m[1]}:${l[1]}:${l[2].match(/<syllabic>(\w+)<\/syllabic>/)?.[1] ?? '-'}:${l[2].match(/<text>([^<]*)<\/text>/)?.[1] ?? ''}`,
    ),
  );
};
const partialLines = async () => (new TextDecoder().decode(await score.saveMsc('mscx')).match(/<PartialLyricsLine/g) ?? []).length;
/** Selects note `n` of the bar at 0-based index `m` (≥ 1): from a selected bar, the next chord is the first of the bar
 * after it, so the bar before is selected. */
const selectNote = async (m, n) => {
  await score.selectPartMeasureByIndex(0, m - 1);
  await score.selectNextChord();
  for (let i = 0; i < n; i++) await score.selectNextChord();
};

const report = {};
// The last note of the 1st ending: a hyphen cannot reach the 2nd ending, so it is a dash into the repeat.
await selectNote(1, 3);
await score.startLyricsEntry();
const stayed = await score.lyricsEntryCommit('la', SYLLABLE);
report.stayedAfterDash = stayed ? { x: Math.round(stayed.x), text: stayed.text } : null;
await score.lyricsEntryCommit('la', END);
report.dashIntoRepeat = await lyrics();

// The first note of the 2nd ending: a hyphen with nothing typed makes an incoming partial dash; the syllable typed
// there ends the word.
await selectNote(2, 0);
await score.startLyricsEntry();
report.partialBefore = await partialLines();
await score.lyricsEntryCommit('', SYLLABLE);
report.partialAfter = await partialLines();
await score.lyricsEntryCommit('ra', END);
report.incomingDash = await lyrics();
await score.undo();
await score.undo();
report.afterUndo = await lyrics();
report.partialAfterUndo = await partialLines();

// Extenders, in verse 2: at the end of the 1st ending "_" carries the syllable into the repeat; at the start of the
// 2nd ending "_" with nothing typed makes an incoming partial extender.
await selectNote(1, 3);
await score.startLyricsEntry();
await score.lyricsEntryCommit('la', NEW_VERSE);
const stayedMelisma = await score.lyricsEntryCommit('ah', MELISMA);
report.stayedAfterMelisma = stayedMelisma ? { verse: stayedMelisma.verse, text: stayedMelisma.text } : null;
await score.lyricsEntryCommit('ah', END);
report.melismaIntoRepeat = (await lyrics()).filter((l) => l.split(':')[1] === '2');
report.melismaTicks = /<lyric number="2"[\s\S]*?<extend/.test(await score.saveXml());
await selectNote(2, 0);
await score.startLyricsEntry();
await score.lyricsEntryCommit('', NEW_VERSE);
const before = await partialLines();
await score.lyricsEntryCommit('', MELISMA);
report.partialMelismaAdded = (await partialLines()) - before;
await score.lyricsEntryCommit('', END);

console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
