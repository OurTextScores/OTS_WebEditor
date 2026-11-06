import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Range drop (roadmap E11), through the Node build (scripts/range-drop-probe.mjs). The Node build is a local artefact (webmscore-fork/web-public, untracked), so
// this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

function probe(): Record<string, unknown> {
  // The engine's Node build expects stdout to be a file or pipe, not the socket Node uses for child-process pipes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'range-drop-'));
  const output = path.join(dir, 'report.txt');
  const fd = fs.openSync(output, 'w');
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts/range-drop-probe.mjs')], {
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

describe.skipIf(!fs.existsSync(nodeBuild))('range drop', () => {
  const report = fs.existsSync(nodeBuild) ? probe() : {};

  it('previews where the selected range would land, and nothing without a range or off the music', () => {
    expect(report.previewWithoutRange).toEqual([]);
    expect(report.dropWithoutRange).toBe(false);
    // One box, around the point (bar 3)
    expect(report.preview).toEqual([{ page: 0, left: true, right: true }]);
    expect(report.previewOffMusic).toEqual([]);
  });

  it('pastes a copy of the range there, keeping its place in the bar, as one undoable edit', () => {
    expect(report.barsBefore).toEqual(['F4', 'A4', 'C5', 'E5']);
    expect(report.dropped).toBe(true);
    expect(report.barsAfter).toEqual(['F4', 'A4', 'F4', 'E5']);
    expect(report.barsUndone).toEqual(report.barsBefore);
  });
});
