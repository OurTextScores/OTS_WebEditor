import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Lyric entry (roadmap E17), through the Node build (scripts/lyrics-entry-probe.mjs). The Node build is a
// local artefact (webmscore-fork/web-public, untracked), so this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

function probe(): Record<string, unknown> {
  // The engine's Node build expects stdout to be a file or pipe, not the socket Node uses for child-process pipes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-entry-'));
  const output = path.join(dir, 'report.txt');
  const fd = fs.openSync(output, 'w');
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts/lyrics-entry-probe.mjs')], {
      cwd: root,
      stdio: ['ignore', fd, 'pipe'],
      timeout: 120_000,
    });
    return JSON.parse(fs.readFileSync(output, 'utf8').trim().split('\n').pop() ?? '{}');
  } finally {
    fs.closeSync(fd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe.skipIf(!fs.existsSync(nodeBuild))('lyric entry in the engine', () => {
  const report = fs.existsSync(nodeBuild) ? probe() : {};

  it('starts at the selected note, verse 1, with a box under the staff', () => {
    expect(report.start).toMatchObject({ page: 0, verse: 0, text: '' });
  });

  it('writes syllables as MuseScore’s keys do: hyphen, word, an extender over a further note, verses', () => {
    expect(report.lyrics).toEqual([
      '1:begin:Hel',
      '1:end:lo',
      '1:single:world+extend',
      // MusicXML marks the note an extender continues over with an empty lyric.
      '1:-:+extend',
      '1:single:ah',
      '1:single:sing | 2:single:two',
    ]);
  });

  it('moves the box note by note, by verse, and back; Escape stops', () => {
    const steps = report.steps as ({ x: number; verse: number; text: string } | null)[];
    const xs = steps.slice(0, 5).map((s) => s!.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(steps[5]).toMatchObject({ verse: 1 });
    expect(steps[6]).toMatchObject({ verse: 0, text: 'sing' });
    expect(steps[7]!.x).toBeLessThan(steps[6]!.x);
    expect(report.backText).toBe('ah');
    expect(steps.at(-1)).toBeNull();
  });

  it('removes an emptied syllable, undoably', () => {
    expect(report.afterEmptying).toEqual((report.lyrics as string[]).slice(1));
    expect(report.afterUndo).toEqual(report.lyrics);
  });
});
