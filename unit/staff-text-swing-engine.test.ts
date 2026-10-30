import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Staff/System Text Properties (swing), through the Node build (scripts/staff-text-swing-probe.mjs). The Node build is a
// local artefact (webmscore-fork/web-public, untracked), so this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

function probe(): Record<string, unknown> {
  // The engine's Node build expects stdout to be a file or pipe, not the socket Node uses for child-process pipes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staff-text-swing-'));
  const output = path.join(dir, 'report.txt');
  const fd = fs.openSync(output, 'w');
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts/staff-text-swing-probe.mjs')], {
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

describe.skipIf(!fs.existsSync(nodeBuild))('staff and system text swing in the engine', () => {
  const report = fs.existsSync(nodeBuild) ? probe() : {};

  it('reads nothing without a selected text, and an unset swing on a new system text', () => {
    expect(report.none).toEqual({});
    expect(report.added).toBe(true);
    expect(report.found).toBe(true);
    // As MuseScore's form opens on a new text: swing unchecked, Eighth, 60%.
    expect(report.initial).toEqual({ system: true, swing: false, unit: 'eighth', ratio: 60 });
  });

  it('sets eighth swing, which changes the playback, and undo restores it', () => {
    expect(report.set).toBe(true);
    expect(report.after).toEqual({ system: true, swing: true, unit: 'eighth', ratio: 66 });
    expect(report.midiAfter).not.toBe(report.midiBefore);
    expect(report.badUnit).toBe(false);
    expect(report.midiAfterUndo).toBe(report.midiBefore);
  });
});
