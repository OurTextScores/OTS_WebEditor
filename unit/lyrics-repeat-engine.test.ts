import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Lyrics across a repeat jump (roadmap E17), through the Node build (scripts/lyrics-repeat-probe.mjs). The Node build is a
// local artefact (webmscore-fork/web-public, untracked), so this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

function probe(): Record<string, unknown> {
  // The engine's Node build expects stdout to be a file or pipe, not the socket Node uses for child-process pipes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-repeat-'));
  const output = path.join(dir, 'report.txt');
  const fd = fs.openSync(output, 'w');
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts/lyrics-repeat-probe.mjs')], {
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

describe.skipIf(!fs.existsSync(nodeBuild))('lyric dashes and extenders across a repeat jump', () => {
  const report = fs.existsSync(nodeBuild) ? probe() : {};

  it('keeps a hyphen at the end of the 1st ending as a dash into the repeat, the entry staying there', () => {
    expect(report.dashIntoRepeat).toEqual(['2:1:begin:la']);
    expect(report.stayedAfterDash).toMatchObject({ text: 'la' });
  });

  it('makes an incoming partial dash at the start of the 2nd ending, ending the word there; undoably', () => {
    expect(report.partialBefore).toBe(0);
    expect(report.partialAfter).toBe(1);
    expect(report.incomingDash).toEqual(['2:1:begin:la', '3:1:end:ra']);
    expect(report.afterUndo).toEqual(['2:1:begin:la']);
    expect(report.partialAfterUndo).toBe(0);
  });

  it('carries an extender into the repeat, and makes an incoming partial extender after it', () => {
    expect(report.stayedAfterMelisma).toMatchObject({ verse: 1, text: 'ah' });
    expect((report.melismaIntoRepeat as string[])[0]).toBe('2:2:single:ah');
    expect(report.melismaTicks).toBe(true);
    expect(report.partialMelismaAdded).toBe(1);
  });
});
