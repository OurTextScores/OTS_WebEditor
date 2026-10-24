import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Scores written by MuseScore 4.1+ that the 4.00 engine used to read wrongly (docs/private/MSCX_FORMAT_DELTA_CHECKLIST.md,
// P0). Fixtures are upstream MuseScore test scores wrapped as .mscz. They run against the real engine through
// scripts/format-compat-probe.mjs, one process per fixture because the Node build manages one load per process.
// The Node build is a local artefact (webmscore-fork/web-public, untracked), so this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

interface ProbeReport {
  parts: number;
  measures: number;
  fifths: number[];
  words: string[];
}

function probe(fixture: string): ProbeReport {
  const out = execFileSync(process.execPath, [path.join(root, 'scripts/format-compat-probe.mjs'), `test_scores/format-compat/${fixture}`], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 120_000,
  });
  const line = out.trim().split('\n').pop() ?? '';
  return JSON.parse(line) as ProbeReport;
}

describe.skipIf(!fs.existsSync(nodeBuild))('loading scores from newer MuseScore versions', () => {
  it('reads a MuseScore 4.2–4.4 score that has <LastEID> before <Score> (was an empty score)', () => {
    const report = probe('lasteid-4.20.mscz');
    expect(report.parts).toBe(2);
    expect(report.measures).toBe(4);
  });

  it('reads 4.1+ key signatures from <concertKey>/<actualKey> (all were C major)', () => {
    expect(probe('keysig-concertkey-4.70.mscz').fifths).toEqual([0, 1, 2, -3]);
  });

  it('keeps 4.7 <br/> line breaks inside text (lines ran together)', () => {
    // MusicXML export splits multi-line text into several <words> runs, so check the joined text
    const text = probe('text-linebreak-4.70.mscz').words.join('');
    expect(text).toMatch(/in 4\/4\s*\n\s*N = 1 eighth note/);
  });
});
