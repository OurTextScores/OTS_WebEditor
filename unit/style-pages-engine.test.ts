import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The Style dialog's generated pages (roadmap E08), through the Node build (scripts/style-pages-probe.mjs). The Node build is a
// local artefact (webmscore-fork/web-public, untracked), so this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

function probe(): Record<string, unknown> {
  // The engine's Node build expects stdout to be a file or pipe, not the socket Node uses for child-process pipes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'style-pages-'));
  const output = path.join(dir, 'report.txt');
  const fd = fs.openSync(output, 'w');
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts/style-pages-probe.mjs')], {
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

describe.skipIf(!fs.existsSync(nodeBuild))('Style dialog pages in the engine', () => {
  const report = fs.existsSync(nodeBuild) ? probe() : {};

  it('reads every generated key except the two point offsets, each with a MuseScore default', () => {
    expect(report.unreadable).toEqual(['lyricsPosAbove', 'lyricsPosBelow']);
    expect(report.withoutDefault).toEqual([]);
    expect(report.enumDefaults).toEqual(report.enumsBefore);
  });

  it('writes enum-typed keys as ints, refuses other values, and undoes', () => {
    expect(report.set).toBe(true);
    expect(report.enumsAfter).toEqual({ ottavaLineStyle: 2, pedalPlacement: 0, tupletDirection: 1 });
    expect(report.badEnum).toBe(false);
    expect(report.enumsAfterUndo).toEqual(report.enumsBefore);
  });
});
