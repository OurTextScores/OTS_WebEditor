import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Performer mode Phase 7a's engine side, addElementsAt, through the Node build (scripts/engrave-marks-probe.mjs).
// The Node build is a local artefact (webmscore-fork/web-public, untracked), so this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

function probe(): Record<string, unknown> {
  // The engine's Node build expects stdout to be a file or pipe, not the socket Node uses for child-process pipes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'engrave-marks-'));
  const output = path.join(dir, 'report.txt');
  const fd = fs.openSync(output, 'w');
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts/engrave-marks-probe.mjs')], {
      cwd: root,
      stdio: ['ignore', fd, 'pipe'],
      timeout: 240_000,
    });
    return JSON.parse(fs.readFileSync(output, 'utf8').trim().split('\n').pop() ?? '{}');
  } finally {
    fs.closeSync(fd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe.skipIf(!fs.existsSync(nodeBuild))('engraving stamps at musical positions', () => {
  const report = fs.existsSync(nodeBuild) ? probe() : {};

  it('engraves a dynamic, a fingering, a bowing, a fermata and a breath mark where they were put', () => {
    expect(report.results).toEqual([
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: false, reason: 'unknown dynamic' },
      { ok: false, reason: 'no note or rest at that beat' },
      { ok: false, reason: 'the note is not spelled with that sign' },
    ]);
    expect(report).toMatchObject({
      dynamics: 1,
      fingerings: 1,
      upBows: 1,
      fermatas: 1,
      breaths: 1,
    });
  });

  it('is one edit: one undo takes them all back', () => {
    expect(report.dynamicsAfterUndo).toBe(0);
  });

  it('adds a sharp stamp on an F sharp as a courtesy accidental, in parentheses', () => {
    expect(report.courtesyTick).toBeGreaterThan(0);
    expect(report.courtesyBracketed).toBe(true);
  });

  it('engraves hairpins, slurs and text of each style (Phase 7c)', () => {
    expect(report.shapeResults).toEqual([
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: false, reason: 'a slur needs two notes' },
    ]);
    expect(report).toMatchObject({ hairpins: 1, expressions: 1, staffTexts: 1, systemTexts: 1 });
    expect(report.slurs).toBeGreaterThanOrEqual(1);
  });
});
