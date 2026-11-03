#!/usr/bin/env node
// MEI conformance (roadmap E25): MuseScore's own MEI tests (src/importexport/mei/tests), through the Node build. For a
// test pair, import <name>.mei, save MSCX and compare its parts and measures with MuseScore's reference <name>.mscx, then export MEI again and
// compare with the original (the round trip), as mei_tests.cpp does. What MuseScore writes differently in its test mode
// (see fromParts, mscxLines) or only with layout export on (meiLines), and what stamps the run (program version and
// revision, element ids, the export date), is left out of the comparison. One JSON line; one pair per process (the
// Node build manages one load per process).
//
//   node scripts/mei-conformance-probe.mjs <name>          (prints JSON)
//   node scripts/mei-conformance-probe.mjs --all           (runs every pair, one process each; prints a summary)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = path.join(root, 'tools/musescore/fixtures/mei-conformance');
const arg = process.argv[2];

if (arg === '--all') {
  const names = fs
    .readdirSync(fixtures)
    .filter((f) => f.endsWith('.mei'))
    .map((f) => f.replace(/\.mei$/, ''))
    .sort();
  const results = names.map((name) => {
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
  const summary = {
    total: results.length,
    imported: results.filter((r) => r.loaded).length,
    mscxMatch: results.filter((r) => r.mscxMatch).length,
    meiMatch: results.filter((r) => r.meiMatch).length,
    failures: results
      .filter((r) => !r.mscxMatch || !r.meiMatch)
      .map((r) => ({ name: r.name, error: r.error, mscx: r.mscxDiff, mei: r.meiDiff })),
  };
  console.log(JSON.stringify(summary));
  process.exit(0);
}

const require = createRequire(import.meta.url);
const lib = require(path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs'));
const WebMscore = lib.default ?? lib;
await WebMscore.ready;

const STAMPS = /<programVersion>|<programRevision>|<eid>|isodate=/;
const lines = (text) =>
  text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !STAMPS.test(line));
/**
 * Test mode writes the layout's beam positions (<Beam> with <l1>/<l2>, also in tremolos) and no <synti>. The harmony
 * playback channel is set up by the editor's load for a score with chord symbols, which the test's load does not do.
 */
const mscxLines = (text) =>
  lines(
    text
      .replace(/<Beam>[\s\S]*?<\/Beam>/g, '')
      .replace(/<Channel name="harmony">[\s\S]*?<\/Channel>/g, ''),
  ).filter((line) => !/^<(l1|l2|synti)>/.test(line));
/** The test exports with layout off: no page and system breaks of the layout (an encoded break has a type). */
const meiLines = (text) => lines(text).filter((line) => line !== '<pb />' && line !== '<sb />');
/** The first line where the two differ, or null when they match. */
const firstDifference = (a, e) => {
  for (let i = 0; i < Math.max(a.length, e.length); i++) {
    if (a[i] !== e[i]) return { line: i + 1, actual: a[i] ?? null, expected: e[i] ?? null };
  }
  return null;
};

/**
 * The score from its first part on. MuseScore's references are saved in its test mode, which writes only the style
 * values that differ from the defaults; the parts, staves and measures are what the import made.
 */
const fromParts = (text) => text.slice(Math.max(0, text.indexOf('<Part')));

const log = console.log;
console.log = () => {};
const report = { name: arg };
try {
  const score = await WebMscore.load('mei', fs.readFileSync(path.join(fixtures, `${arg}.mei`)));
  report.loaded = true;
  report.warnings = (await score.loadProfile?.())?.importWarnings ?? [];
  const mscx = new TextDecoder().decode(await score.saveMsc('mscx'));
  report.mscxDiff = firstDifference(
    mscxLines(fromParts(mscx)),
    mscxLines(fromParts(fs.readFileSync(path.join(fixtures, `${arg}.mscx`), 'utf8'))),
  );
  report.mscxMatch = report.mscxDiff === null;
  const mei = new TextDecoder().decode(await score.saveMei());
  report.meiDiff = firstDifference(
    meiLines(mei),
    meiLines(fs.readFileSync(path.join(fixtures, `${arg}.mei`), 'utf8')),
  );
  report.meiMatch = report.meiDiff === null;
} catch (error) {
  report.error = String(error?.message ?? error).slice(0, 200);
}
console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
