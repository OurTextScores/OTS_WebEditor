import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The Play-through view's engine side (performer mode, Phase 3), through the Node build
// (scripts/play-through-probe.mjs). The Node build is a local artefact (webmscore-fork/web-public, untracked), so
// this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

function probe(): Record<string, unknown> {
  // The engine's Node build expects stdout to be a file or pipe, not the socket Node uses for child-process pipes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'play-through-'));
  const output = path.join(dir, 'report.txt');
  const fd = fs.openSync(output, 'w');
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts/play-through-probe.mjs')], {
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

describe.skipIf(!fs.existsSync(nodeBuild))('the score with its repeats written out', () => {
  const report = fs.existsSync(nodeBuild) ? probe() : {};

  it('reads the playing order, with measure-position ids that are the same bar indices', () => {
    expect(report.playedBars).toEqual([0, 1, 0, 2]);
    expect(report.positionIds).toEqual([0, 1, 2]);
  });

  it('writes the repeats out as a score of its own, one bar per bar played, leaving the score as it was', () => {
    expect(report.unrolledIsZip).toBe(true);
    expect(report.unrolledBars).toBe(4);
    expect(report.unrolledPlayed).toEqual([0, 1, 2, 3]);
    expect(report.playedAfter).toEqual([0, 1, 0, 2]);
  });

  it("removes the engraver's line and page breaks for reflow", () => {
    expect(report.systemsAsEngraved).toBe(8);
    expect(report.breaksRemoved).toBeGreaterThanOrEqual(7);
    expect(report.lineBreaksAfter).toBe(0);
    expect(report.systemsReflowed).toBeLessThan(8);
  });
});
