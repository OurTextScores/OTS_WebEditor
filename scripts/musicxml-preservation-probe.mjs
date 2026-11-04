#!/usr/bin/env node
// MusicXML preservation (roadmap E23): OTS's AI tools (context, patch, diff feedback, deep edit, most scoreops) read
// and write the score as MusicXML, and an AI edit comes back into the editor as an imported MusicXML file. A notation
// feature MusicXML does not carry is invisible to them, and lost from the whole score by any AI edit. For each case:
// apply the feature to unit/fixtures/eight-bars.musicxml through the editor's own bridge calls, check its MSCX marker
// is there, export MusicXML, import that, and check the marker again; `described` says whether the MusicXML names it.
// One JSON line; one case per process (the Node build manages one load per process).
//
//   node scripts/musicxml-preservation-probe.mjs <case>     (prints JSON)
//   node scripts/musicxml-preservation-probe.mjs --all      (every case, one process each; prints a summary)
//   node scripts/musicxml-preservation-probe.mjs --lock-carry    (system locks: restoreSystemLocks after the re-import)
//   node scripts/musicxml-preservation-probe.mjs --style-carry   (the editor's fix for style: saveStyle before the
//                                                                  re-import, restoreStyle after, no undo step)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The second note of bar 2 (selectPartMeasureByIndex then selectNextChord lands on bar 2's first note).
const note = async (s) => {
  await s.selectPartMeasureByIndex(0, 1);
  await s.selectNextChord();
  await s.selectNextChord();
};
const bar = (index) => (s) => s.selectPartMeasureByIndex(0, index);
/** A natural on bar 2's second note, selected (the accidental itself, for brackets and braces). */
const accidental = async (s) => {
  await note(s);
  await s.setAccidental(3);
  return selectDrawn(s, 'Accidental', 'Accidental');
};
/**
 * Select the element drawn with SVG class `cls` (the last one on page 1), by scanning around its glyphs' origin with
 * the same point selection and cycling the editor uses (as scripts/rich-text-probe.mjs does).
 */
const selectDrawn = async (s, cls, elementType) => {
  const svg = await s.saveSvg(0, true);
  const before = svg.slice(0, svg.lastIndexOf(`class="${cls}"`));
  const matrix = [...before.matchAll(/matrix\(([^)]*)\)/g)].at(-1);
  if (!matrix) return false;
  const [, , , , e, f] = matrix[1].split(/[\s,]+/).map(Number);
  for (let dy = -60; dy <= 20; dy += 5) {
    for (let dx = -10; dx <= 80; dx += 5) {
      await s.clearSelection();
      await s.selectElementAtPoint(0, e + dx, f + dy);
      // An element under another (an accidental under its note) is reached by Ctrl+click cycling, as in MuseScore.
      for (let cycle = 0; cycle < 4; cycle++) {
        if ((await s.getSelectedElementProperties()).elementType === elementType) return true;
        await s.cycleSelectionAtPoint(0, e + dx, f + dy);
      }
    }
  }
  return false;
};

/**
 * Each case: where it applies (`select`), the call, the MSCX marker of the result, and the MusicXML that would carry
 * it (absent where MusicXML has nothing for it). `since` is the roadmap item that added the command, or '3.0' for the
 * notation the editor had before the 4.7 engine.
 */
export const CASES = [
  // New with the 4.7 engine
  {
    name: 'ornament',
    since: 'E10',
    select: note,
    apply: (s) => s.addArticulation('ornamentTurn'),
    mscx: /<Ornament>/,
    musicxml: /<turn\b/,
  },
  {
    name: 'laissez-vibrer',
    since: 'E12',
    select: note,
    apply: (s) => s.toggleLaissezVib(),
    mscx: /<LaissezVib\b/,
    musicxml: /<tied type="let-ring"/,
  },
  {
    name: 'note-parentheses',
    since: 'E14',
    select: note,
    apply: (s) => s.addBrackets(1),
    mscx: /<parentheses>both<\/parentheses>/,
    musicxml: /parentheses="yes"/,
  },
  // Brackets and braces enclose an accidental, as in MuseScore (Score::cmdAddBracket and cmdAddBraces).
  {
    name: 'accidental-brackets',
    since: 'E14',
    select: accidental,
    apply: (s) => s.addBrackets(0),
    // AccidentalBracket: 1 parenthesis, 2 bracket, 3 brace.
    mscx: /<bracket>2<\/bracket>/,
    musicxml: /<accidental[^>]*bracket="yes"/,
  },
  {
    name: 'accidental-braces',
    since: 'E14',
    select: accidental,
    apply: (s) => s.addBrackets(2),
    mscx: /<bracket>3<\/bracket>/,
    musicxml: /<accidental[^>]*(?:brace|bracket)="yes"/,
  },
  {
    name: 'harp-pedal-diagram',
    since: 'E21',
    select: note,
    apply: (s) => s.addHarpPedalDiagram(false),
    mscx: /<HarpPedalDiagram>/,
    musicxml: /<harp-pedals>/,
  },
  {
    name: 'harp-pedal-text',
    since: 'E21',
    select: note,
    // A mixed setting, so the check is the pedals and not only the text form: D flat, C natural, B sharp, ...
    apply: async (s) =>
      (await s.addHarpPedalDiagram(true)) &&
      s.setHarpPedalState({
        pedals: ['flat', 'natural', 'sharp', 'natural', 'flat', 'natural', 'sharp'],
      }),
    mscx: /<isDiagram>0<\/isDiagram>\s*<pedalState>\s*<string name="0">0<\/string>\s*<string name="1">1<\/string>\s*<string name="2">2<\/string>\s*<string name="3">1<\/string>\s*<string name="4">0<\/string>/,
    musicxml: /<words[^>]*>E♮ F♭ G♮ A♯\s*D♭ C♮ B♯/,
  },
  {
    name: 'tremolo',
    since: 'E10',
    select: note,
    apply: (s) => s.addTremolo(0),
    mscx: /<TremoloSingleChord>/,
    musicxml: /<tremolo\b/,
  },
  {
    name: 'system-lock',
    since: 'E06',
    select: async (s) => {
      await s.selectPartMeasureByIndex(0, 0);
    },
    apply: (s) => s.setSystemLock(true),
    mscx: /<SystemLock\b|<systemLock/i,
    musicxml: null,
  },
  {
    name: 'measure-irregular',
    since: 'E16',
    select: bar(1),
    apply: (s) => s.setMeasureProperties({ irregular: true }),
    mscx: /<irregular>1/,
    musicxml: /implicit="yes"/,
  },
  {
    name: 'measure-number-offset',
    since: 'E16',
    select: bar(2),
    apply: (s) => s.setMeasureProperties({ numberOffset: 5 }),
    mscx: /<noOffset>5/,
    musicxml: /number="8"|measure-numbering/,
  },
  {
    name: 'repeat-count',
    since: 'E16',
    select: bar(1),
    apply: async (s) => {
      await s.toggleRepeatEnd();
      return s.setMeasureProperties({ repeatCount: 3 });
    },
    mscx: /<endRepeat>3/,
    musicxml: /times="3"/,
  },
  // MusicXML import reads a "Swing" word as swing at its default ratio, so the check is the ratio set here.
  {
    name: 'staff-text-swing',
    since: 'E06',
    select: note,
    apply: async (s) => {
      await s.addStaffText('Swing');
      return (
        (await selectDrawn(s, 'StaffText', 'StaffText')) &&
        s.setStaffTextSwing({ swing: true, unit: 'eighth', ratio: 66 })
      );
    },
    mscx: /<swing unit="eighth" ratio="66"\/>/,
    musicxml: /<swing>/,
  },
  {
    name: 'lyrics-markup',
    since: 'E17',
    select: note,
    apply: async (s) => {
      await s.addLyricText('Hel');
      return (await selectDrawn(s, 'Lyrics', 'Lyrics')) && s.setSelectedTextXml('<b>Hel</b>');
    },
    mscx: /<Lyrics>[\s\S]*?<b>Hel<\/b>/,
    musicxml: /<lyric\b[\s\S]*?font-weight="bold"/,
  },
  {
    name: 'chord-symbol',
    since: '3.0',
    select: note,
    apply: (s) => s.addHarmonyText(0, 'Cm7'),
    mscx: /<Harmony>/,
    musicxml: /<harmony\b/,
  },
  // Style dialog settings (E08, E16, E24) and element properties (E09, E15)
  {
    name: 'style-staff-distance',
    since: 'E08',
    select: async () => {},
    apply: (s) => s.setStyleValues({ staffDistance: 9 }),
    mscx: /<staffDistance>9<\/staffDistance>/,
    musicxml: /<staff-distance>/,
  },
  {
    name: 'style-measure-number-interval',
    since: 'E16',
    select: async () => {},
    apply: (s) => s.setStyleValues({ measureNumberSystem: false, measureNumberInterval: 2 }),
    mscx: /<measureNumberInterval>2<\/measureNumberInterval>/,
    musicxml: /<measure-numbering[^>]*>(?:measure|2)/,
  },
  {
    name: 'style-multimeasure-rests',
    since: 'E16',
    select: async () => {},
    apply: (s) => s.setStyleValues({ createMultiMeasureRests: true }),
    mscx: /<createMultiMeasureRests>1<\/createMultiMeasureRests>/,
    musicxml: /<multiple-rest\b/,
  },
  {
    name: 'style-music-font',
    since: 'E24',
    select: async () => {},
    apply: (s) => s.setStyleValues({ musicalSymbolFont: 'Bravura' }),
    mscx: /<musicalSymbolFont>Bravura<\/musicalSymbolFont>/,
    musicxml: /<music-font[^>]*font-family="Bravura/,
  },
  {
    name: 'note-color',
    since: 'E09',
    select: note,
    apply: (s) => s.setElementPropertyValue('color', '#FF0000FF'),
    mscx: /<color r="255" g="0" b="0"/,
    musicxml: /color="#FF0000"/i,
  },
  // Notation the editor had before the 4.7 engine, for comparison
  {
    name: 'dynamic',
    since: '3.0',
    select: note,
    apply: (s) => s.addDynamic(5),
    mscx: /<Dynamic>/,
    musicxml: /<dynamics\b/,
  },
  {
    name: 'hairpin',
    since: '3.0',
    select: note,
    apply: (s) => s.addHairpin(0),
    mscx: /<HairPin\b/,
    musicxml: /<wedge\b/,
  },
  {
    name: 'fermata',
    since: '3.0',
    select: note,
    apply: (s) => s.addFermata(0),
    mscx: /<Fermata>/,
    musicxml: /<fermata\b/,
  },
  {
    name: 'breath',
    since: '3.0',
    select: note,
    apply: (s) => s.addBreath(0),
    mscx: /<Breath>/,
    musicxml: /<breath-mark\b|<caesura/,
  },
  {
    name: 'ottava',
    since: '3.0',
    select: note,
    apply: (s) => s.addOttava(0),
    mscx: /<Ottava\b/,
    musicxml: /<octave-shift\b/,
  },
  {
    name: 'pedal',
    since: '3.0',
    select: note,
    apply: (s) => s.addPedal(0),
    mscx: /<Pedal\b/,
    musicxml: /<pedal\b/,
  },
  {
    name: 'volta',
    since: '3.0',
    select: bar(1),
    apply: (s) => s.addVolta(1),
    mscx: /<Volta\b/,
    musicxml: /<ending\b/,
  },
  {
    name: 'rehearsal-mark',
    since: '3.0',
    select: note,
    apply: (s) => s.addRehearsalMark(),
    mscx: /<RehearsalMark>/,
    musicxml: /<rehearsal\b/,
  },
  {
    name: 'tempo',
    since: '3.0',
    select: note,
    apply: (s) => s.addTempoText(96),
    mscx: /<Tempo>/,
    musicxml: /<metronome\b|<sound tempo/,
  },
  {
    name: 'slur',
    since: '3.0',
    select: async (s) => {
      await note(s);
      await s.extendSelectionNextChord();
    },
    apply: (s) => s.addSlur(),
    mscx: /<Slur\b/,
    musicxml: /<slur\b/,
  },
];
const ALL = CASES;

const arg = process.argv[2];
if (arg === '--all') {
  const results = ALL.map(({ name }) => {
    try {
      const out = execFileSync(process.execPath, [fileURLToPath(import.meta.url), name], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 120_000,
      });
      return JSON.parse(out.trim().split('\n').at(-1));
    } catch (error) {
      return { name, error: String(error.message ?? error).slice(0, 120) };
    }
  });
  console.log(JSON.stringify({ results }));
  process.exit(0);
}

if (arg === '--lock-carry') {
  const lib = createRequire(import.meta.url)(
    path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs'),
  );
  const WebMscore = lib.default ?? lib;
  await WebMscore.ready;
  const log = console.log;
  console.log = () => {};
  const decode = (data) => (typeof data === 'string' ? data : new TextDecoder().decode(data));
  const score = await WebMscore.load(
    'musicxml',
    fs.readFileSync(path.join(root, 'unit/fixtures/eight-bars.musicxml')),
  );
  await score.selectPartMeasureByIndex(0, 1);
  await score.extendSelectionNextMeasure();
  await score.setSystemLock(true);
  await score.selectPartMeasureByIndex(0, 4);
  await score.setSystemLock(true);
  const locks = (await score.getSystemLockState()).locks;
  const xml = decode(await score.saveXml());
  score.destroy();
  const back = await WebMscore.load('musicxml', new TextEncoder().encode(xml));
  const report = { locks, lostByMusicXml: (await back.getSystemLockState()).locks };
  // Off the score, reversed, and overlapping the first lock: skipped.
  report.added = await back.restoreSystemLocks([
    ...locks,
    { startMeasure: 40, endMeasure: 41 },
    { startMeasure: 6, endMeasure: 5 },
    { startMeasure: 2, endMeasure: 3 },
  ]);
  report.afterRestore = (await back.getSystemLockState()).locks;
  report.undoStepsAfterRestore = (await back.getUndoInfo()).size;
  console.log = log;
  console.log(JSON.stringify(report));
  process.exit(0);
}

if (arg === '--style-carry') {
  const lib = createRequire(import.meta.url)(
    path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs'),
  );
  const WebMscore = lib.default ?? lib;
  await WebMscore.ready;
  const log = console.log;
  console.log = () => {};
  const decode = (data) => (typeof data === 'string' ? data : new TextDecoder().decode(data));
  const STYLE = {
    staffDistance: 9,
    measureNumberSystem: false,
    measureNumberInterval: 2,
    createMultiMeasureRests: true,
  };
  const KEYS = Object.keys(STYLE);
  const score = await WebMscore.load(
    'musicxml',
    fs.readFileSync(path.join(root, 'unit/fixtures/eight-bars.musicxml')),
  );
  await score.setStyleValues(STYLE);
  const style = await score.saveStyle();
  const xml = decode(await score.saveXml());
  score.destroy();
  const back = await WebMscore.load('musicxml', new TextEncoder().encode(xml));
  const report = { lostByMusicXml: await back.getStyleValues(KEYS) };
  report.restored = await back.restoreStyle(style);
  report.afterRestore = await back.getStyleValues(KEYS);
  report.undoStepsAfterRestore = (await back.getUndoInfo()).size;
  console.log = log;
  console.log(JSON.stringify(report));
  process.exit(0);
}

const testCase = ALL.find((c) => c.name === arg);
if (!testCase) {
  console.error(`unknown case ${arg}`);
  process.exit(2);
}
const lib = createRequire(import.meta.url)(
  path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs'),
);
const WebMscore = lib.default ?? lib;
await WebMscore.ready;
const log = console.log;
console.log = () => {};
const report = { name: testCase.name, since: testCase.since };
const decode = (data) => (typeof data === 'string' ? data : new TextDecoder().decode(data));
try {
  const score = await WebMscore.load(
    'musicxml',
    fs.readFileSync(path.join(root, 'unit/fixtures/eight-bars.musicxml')),
  );
  await testCase.select(score);
  report.applied = Boolean(await testCase.apply(score));
  report.inEditor = testCase.mscx.test(decode(await score.saveMsc('mscx')));
  const xml = decode(await score.saveXml());
  report.described = testCase.musicxml ? testCase.musicxml.test(xml) : false;
  score.destroy();
  const back = await WebMscore.load('musicxml', new TextEncoder().encode(xml));
  report.afterRoundTrip = testCase.mscx.test(decode(await back.saveMsc('mscx')));
} catch (error) {
  report.error = String(error?.message ?? error).slice(0, 200);
}
console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
