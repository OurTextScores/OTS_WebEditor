import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Part layout (roadmap E18, slice 3), through the Node build (scripts/part-layout-probe.mjs). The Node build is a
// local artefact (webmscore-fork/web-public, untracked), so this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

function probe(): Record<string, unknown> {
  // The engine's Node build expects stdout to be a file or pipe, not the socket Node uses for child-process pipes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'part-layout-'));
  const output = path.join(dir, 'report.txt');
  const fd = fs.openSync(output, 'w');
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts/part-layout-probe.mjs')], {
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

describe.skipIf(!fs.existsSync(nodeBuild))('part layout in the engine', () => {
  const report = fs.existsSync(nodeBuild) ? probe() : {};

  it('gives each part its own style and layout breaks, with multimeasure rests by default', () => {
    expect(report.parts).toEqual(['Violin', 'Cello']);
    expect(report.multimeasureRests).toEqual({ score: false, part: true });
    expect(report.staffDistance).toEqual({ score: 6.5, part: 9 });
    expect(report.lineBreaks).toEqual({ part: 1, score: 0 });
  });

  it('offers score and part synchronization only in a part, as MuseScore does', () => {
    expect(report.offered).toEqual({
      scoreNote: [],
      partNote: ['appearanceLinkedToMaster', 'positionLinkedToMaster'],
      partDynamic: ['appearanceLinkedToMaster', 'positionLinkedToMaster'],
    });
  });

  it('unlinks an element whose appearance is changed in a part, and takes the score back when resynchronized', () => {
    expect(report.afterPartColour).toEqual({ linked: 'false', color: '#FF0000FF' });
    expect(report.scoreDynamicColoured).toBe(false);
    expect(report.afterResync).toEqual({ linked: 'true', color: '#000000FF' });
  });
});
