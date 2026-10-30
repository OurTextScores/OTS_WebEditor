import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Harp pedal diagrams (roadmap E21), through the Node build (scripts/harp-pedal-probe.mjs). The Node build is a
// local artefact (webmscore-fork/web-public, untracked), so this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

function probe(): Record<string, unknown> {
  // The engine's Node build expects stdout to be a file or pipe, not the socket Node uses for child-process pipes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harp-pedal-'));
  const output = path.join(dir, 'report.txt');
  const fd = fs.openSync(output, 'w');
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts/harp-pedal-probe.mjs')], {
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

describe.skipIf(!fs.existsSync(nodeBuild))('harp pedal diagrams in the engine', () => {
  const report = fs.existsSync(nodeBuild) ? probe() : {};

  it('adds a diagram on the selected note, selected', () => {
    expect(report.added).toBe(true);
    expect(report.selected).toBe('HarpPedalDiagram');
    expect((report.initial as { pedals: string[] }).pedals).toHaveLength(7);
  });

  it('sets the pedals and the form as one edit, which undo reverts', () => {
    expect(report.set).toBe(true);
    expect(report.after).toEqual({ pedals: ['flat', 'natural', 'sharp', 'natural', 'natural', 'natural', 'flat'], isDiagram: false });
    expect(report.badSet).toBe(false);
    expect(report.afterUndo).toEqual(report.initial);
  });
});
