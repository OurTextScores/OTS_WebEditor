import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// MusicXML preservation (roadmap E23), through the Node build (scripts/musicxml-preservation-probe.mjs): which notation
// the editor can make survives a MusicXML export and re-import, the path an applied AI edit takes. The lists pin
// today's behaviour: a feature moving from one to the other (a fix, or a regression) has to be recorded here. The Node
// build is a local artefact (webmscore-fork/web-public, untracked), so this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

function probe(mode: string): Record<string, unknown> {
  // The engine's Node build expects stdout to be a file or pipe, not the socket Node uses for child-process pipes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'musicxml-preservation-'));
  const output = path.join(dir, 'report.txt');
  const fd = fs.openSync(output, 'w');
  try {
    execFileSync(
      process.execPath,
      [path.join(root, 'scripts/musicxml-preservation-probe.mjs'), mode],
      {
        cwd: root,
        stdio: ['ignore', fd, 'pipe'],
        timeout: 900_000,
      },
    );
    return JSON.parse(fs.readFileSync(output, 'utf8').trim().split('\n').pop() ?? '{}');
  } finally {
    fs.closeSync(fd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

type CaseResult = {
  name: string;
  applied?: boolean;
  inEditor?: boolean;
  afterRoundTrip?: boolean;
  error?: string;
};

const SURVIVES = [
  'ornament',
  'laissez-vibrer',
  'note-parentheses',
  'accidental-brackets',
  'harp-pedal-diagram',
  'harp-pedal-text',
  'tremolo',
  'measure-irregular',
  'measure-number-offset',
  'repeat-count',
  'lyrics-markup',
  'staff-text-swing',
  'note-color',
  'chord-symbol',
  'dynamic',
  'hairpin',
  'fermata',
  'breath',
  'ottava',
  'pedal',
  'volta',
  'rehearsal-mark',
  'tempo',
  'slur',
];
/**
 * Lost by MusicXML: braces on accidentals (MusicXML has parentheses and brackets only), system locks (layout), and
 * Style dialog settings (the editor carries those across an applied edit: see the style-carry test below). A staff
 * text's swing and harp pedals written as text survive since patch 0008.
 */
const LOST = [
  'accidental-braces',
  'system-lock',
  'style-staff-distance',
  'style-measure-number-interval',
  'style-multimeasure-rests',
  'style-music-font',
];

describe.skipIf(!fs.existsSync(nodeBuild))('notation through a MusicXML round trip', () => {
  const results = fs.existsSync(nodeBuild) ? ((probe('--all').results as CaseResult[]) ?? []) : [];

  it('applies every case in the editor', () => {
    const notApplied = results
      .filter((r) => !r.applied || !r.inEditor || r.error)
      .map((r) => r.name);
    expect(notApplied).toEqual([]);
    expect(results.map((r) => r.name).sort()).toEqual([...SURVIVES, ...LOST].sort());
  });

  it('keeps what MusicXML carries, and loses only the known gaps', () => {
    expect(
      results
        .filter((r) => r.afterRoundTrip)
        .map((r) => r.name)
        .sort(),
    ).toEqual([...SURVIVES].sort());
    expect(
      results
        .filter((r) => !r.afterRoundTrip)
        .map((r) => r.name)
        .sort(),
    ).toEqual([...LOST].sort());
  });

  it('carries the Style settings across the re-import, without an undo step', () => {
    const report = probe('--style-carry');
    const set = {
      staffDistance: 9,
      measureNumberSystem: false,
      measureNumberInterval: 2,
      createMultiMeasureRests: true,
    };
    expect(report.lostByMusicXml).not.toEqual(set);
    expect(report.restored).toBe(true);
    expect(report.afterRestore).toEqual(set);
    expect(report.undoStepsAfterRestore).toBe(0);
  });
});
