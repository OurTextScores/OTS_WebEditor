import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Selection within a chord and Repeat Selection (roadmap E11), through the Node build
// (scripts/chord-selection-probe.mjs). The Node build is a local artefact (webmscore-fork/web-public, untracked), so
// this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

type Selected = { type: string | null; y: number | null };
type Move = { moved: boolean; now: Selected };

function probe(): Record<string, unknown> {
  // The engine's Node build expects stdout to be a file or pipe, not the socket Node uses for child-process pipes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chord-selection-'));
  const output = path.join(dir, 'report.txt');
  const fd = fs.openSync(output, 'w');
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts/chord-selection-probe.mjs')], {
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

describe.skipIf(!fs.existsSync(nodeBuild))('selection within a chord, and Repeat Selection', () => {
  const report = fs.existsSync(nodeBuild) ? probe() : {};
  const move = (key: string) => report[key] as Move;

  it('moves to the note below and above in the chord, refusing past either end', () => {
    const top = (report.start as Selected).y!;
    expect((report.start as Selected).type).toBe('Note');
    expect(move('bottom')).toMatchObject({ moved: true, now: { type: 'Note' } });
    const bottom = move('bottom').now.y!;
    expect(bottom).toBeGreaterThan(top); // lower on the page
    expect(move('bottomAgain')).toEqual({ moved: false, now: { type: 'Note', y: bottom } });
    expect(move('above')).toEqual({ moved: true, now: { type: 'Note', y: top } });
    expect(move('pastTop')).toEqual({ moved: false, now: { type: 'Note', y: top } });
    expect(move('below')).toEqual({ moved: true, now: { type: 'Note', y: bottom } });
    expect(move('top')).toEqual({ moved: true, now: { type: 'Note', y: top } });
  });

  it('repeats a bar after itself as one undoable edit, and refuses an empty selection', () => {
    expect(report.barsBefore).toEqual(['F4', 'A4', 'C5', 'E5']);
    expect(report.repeated).toBe(true);
    expect(report.barsAfter).toEqual(['F4', 'F4', 'C5', 'E5']);
    expect(report.barsUndone).toEqual(report.barsBefore);
    expect(report.repeatNothing).toBe(false);
  });
});
