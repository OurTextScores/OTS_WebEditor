#!/usr/bin/env node
// MNX conformance (roadmap E29): MuseScore's own MNX tests (src/importexport/mnx/tests: its project examples and the
// W3C examples), through the Node build. For each case in tools/musescore/fixtures/mnx-conformance/cases.json:
// import the MNX, save MSCX and compare with MuseScore's reference; then, where MuseScore does, export MNX, import that
// and compare with the same reference (the round trip), as mnx_tests.cpp does. The comparison normalises what
// mnx_tests.cpp does (track names, plain barlines, beam modes for the case it names) and leaves out what MuseScore
// writes only in its test mode (see mscxLines). One JSON line; one case per process (the Node build manages one load
// per process).
//
//   node scripts/mnx-conformance-probe.mjs <name>          (prints JSON)
//   node scripts/mnx-conformance-probe.mjs --all           (runs every case, one process each; prints a summary)
//   node scripts/mnx-conformance-probe.mjs --refusals      (bad input is refused with a message, and the engine
//                                                           still loads a good file afterwards)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = path.join(root, 'tools/musescore/fixtures/mnx-conformance');
const { cases } = JSON.parse(fs.readFileSync(path.join(fixtures, 'cases.json'), 'utf8'));
const arg = process.argv[2];

if (arg === '--all') {
  const results = cases.map(({ name }) => {
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
  const roundTrips = results.filter((r) => r.roundTrip);
  console.log(
    JSON.stringify({
      total: results.length,
      imported: results.filter((r) => r.loaded).length,
      importMatch: results.filter((r) => r.importMatch).length,
      roundTrips: roundTrips.length,
      roundTripMatch: roundTrips.filter((r) => r.roundTripMatch).length,
      failures: results
        .filter((r) => !r.importMatch || (r.roundTrip && !r.roundTripMatch))
        .map((r) => ({
          name: r.name,
          error: r.error,
          import: r.importDiff,
          roundTrip: r.roundTripDiff,
        })),
    }),
  );
  process.exit(0);
}

if (arg === '--refusals') {
  const require = createRequire(import.meta.url);
  const lib = require(path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs'));
  const WebMscore = lib.default ?? lib;
  await WebMscore.ready;
  const log = console.log;
  console.log = () => {};
  const refusal = async (text) => {
    try {
      await WebMscore.load('mnx', new TextEncoder().encode(text));
      return null;
    } catch (error) {
      return String(error?.message ?? error);
    }
  };
  const report = {
    // Not JSON: nlohmann::json throws, caught in mnxio.cpp.
    malformed: await refusal('{"mnx": '),
    // JSON, but not to the MNX schema.
    invalid: await refusal('{"mnx": {"version": 1}}'),
  };
  const good = cases.find((c) => c.name === 'hello-world');
  const score = await WebMscore.load('mnx', fs.readFileSync(path.join(fixtures, good.source)));
  report.loadsAfterwards = (await score.metadata()).measures ?? null;
  console.log = log;
  console.log(JSON.stringify(report));
  process.exit(0);
}

const testCase = cases.find((c) => c.name === arg);
if (!testCase) {
  console.error(`unknown case ${arg}`);
  process.exit(2);
}

const require = createRequire(import.meta.url);
const lib = require(path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs'));
const WebMscore = lib.default ?? lib;
await WebMscore.ready;

/** mnx_tests.cpp's normalizeMscxText: track names change on a round trip, plain barlines are not exported. */
const normalize = (text, normalizeBeamMode) => {
  let out = text
    .replace(/\r\n/g, '\n')
    .replace(/<trackName>[\s\S]*?<\/trackName>/g, '')
    .replace(/<BarLine>(?:(?!<subtype>)[\s\S])*?<\/BarLine>/g, '');
  if (normalizeBeamMode) out = out.replace(/<BeamMode>[\s\S]*?<\/BeamMode>/g, '');
  return out;
};
/**
 * The score from its first part on, line by line. The references are saved in MuseScore's test mode, which writes
 * only the style values that differ from the defaults, the layout's beam positions (<l1>/<l2>) and no <synti>; the
 * harmony playback channel is set up by the editor's load for a score with chord symbols.
 */
const mscxLines = (text) =>
  text
    .slice(Math.max(0, text.indexOf('<Part')))
    .replace(/<Beam>[\s\S]*?<\/Beam>/g, '')
    .replace(/<Channel name="harmony">[\s\S]*?<\/Channel>/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^<(l1|l2|synti|eid)>/.test(line));
const firstDifference = (actual, expected) => {
  const a = mscxLines(normalize(actual, testCase.normalizeBeamMode));
  const e = mscxLines(normalize(expected, testCase.normalizeBeamMode));
  for (let i = 0; i < Math.max(a.length, e.length); i++) {
    if (a[i] !== e[i]) return { line: i + 1, actual: a[i] ?? null, expected: e[i] ?? null };
  }
  return null;
};

const log = console.log;
console.log = () => {};
const report = { name: arg, roundTrip: testCase.roundTrip };
try {
  const reference = fs.readFileSync(path.join(fixtures, testCase.reference), 'utf8');
  const score = await WebMscore.load('mnx', fs.readFileSync(path.join(fixtures, testCase.source)));
  report.loaded = true;
  const mscx = new TextDecoder().decode(await score.saveMsc('mscx'));
  report.importDiff = firstDifference(mscx, reference);
  report.importMatch = report.importDiff === null;
  if (testCase.roundTrip) {
    const mnx = await score.saveMnx();
    score.destroy();
    const again = await WebMscore.load('mnx', mnx);
    report.roundTripDiff = firstDifference(
      new TextDecoder().decode(await again.saveMsc('mscx')),
      reference,
    );
    report.roundTripMatch = report.roundTripDiff === null;
  }
} catch (error) {
  report.error = String(error?.message ?? error).slice(0, 200);
}
console.log = log;
console.log(JSON.stringify(report));
process.exit(0);
