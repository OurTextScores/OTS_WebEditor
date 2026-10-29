import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The engine behind the Page Settings, Style, Load Style, Measure Properties, Select ▸ More… and Realize Chord
// Symbols dialogs, through the Node build (scripts/score-dialogs-probe.mjs). The Node build is a local artefact
// (webmscore-fork/web-public, untracked), so this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

function probe(): Record<string, unknown> {
  // The engine's Node build expects stdout to be a file or pipe, not the socket Node uses for child-process pipes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'score-dialogs-'));
  const output = path.join(dir, 'report.txt');
  const fd = fs.openSync(output, 'w');
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts/score-dialogs-probe.mjs')], {
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

describe.skipIf(!fs.existsSync(nodeBuild))('score dialogs in the engine', () => {
  const report = fs.existsSync(nodeBuild) ? probe() : {};

  it('reads style values by MuseScore key, leaving unknown keys out', () => {
    expect(report.styleBefore).toEqual({ hideEmptyStaves: false, pageWidth: 8.27, staffDistance: 6.5 });
  });

  it('sets style values as one undoable edit, and refuses a mistyped value', () => {
    expect(report.styleSet).toBe(true);
    expect(report.styleAfter).toEqual({ hideEmptyStaves: true, staffDistance: 9 });
    expect(report.styleRejected).toBe(false);
    expect(report.styleUndone).toEqual({ hideEmptyStaves: false, staffDistance: 6.5 });
  });

  it('loads a MuseScore style file, undoably', () => {
    expect(report).toMatchObject({ fontBefore: 'Leland', loadStyle: true, fontAfter: 'MuseJazz', fontUndone: 'Leland' });
  });

  it('reads and edits the selected bar’s Measure Properties', () => {
    expect(report.measureBefore).toMatchObject({ actual: [4, 4], nominal: [4, 4], irregular: false, repeatCount: 2 });
    expect(report.measureSet).toBe(true);
    expect(report.measureAfter).toMatchObject({ actual: [3, 4], nominal: [4, 4], irregular: true, repeatCount: 3 });
  });

  it('selects elements like the pattern, narrowed by Select ▸ More… filters', () => {
    expect(report.selectAllLike).toBe(true);
    expect(report.selectAllLikeCount).toBe(3);
    expect(report.sameMeasure).toBe(true);
    expect(report.sameMeasureCount).toBe(1);
  });

  it('realizes a selected chord symbol as notes', () => {
    expect(report.realize).toBe(true);
    expect(report.notesAdded).toBe(3);
  });
});
