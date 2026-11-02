import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Edit Element on any element with grips, through the Node build (scripts/grip-edit-probe.mjs). The Node build is a
// local artefact (webmscore-fork/web-public, untracked), so this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

function probe(): Record<string, unknown> {
  // The engine's Node build expects stdout to be a file or pipe, not the socket Node uses for child-process pipes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grip-edit-'));
  const output = path.join(dir, 'report.txt');
  const fd = fs.openSync(output, 'w');
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts/grip-edit-probe.mjs')], {
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

describe.skipIf(!fs.existsSync(nodeBuild))('grip editing beyond lines and curves', () => {
  const report = fs.existsSync(nodeBuild) ? probe() : {};

  it('offers Edit Element on a frame (it has a grip) but not on a note (no grip, no text)', () => {
    expect(report.frameFound).toBe(true);
    expect(report.frameEditable).toBe(true);
    expect(report.noteEditable).toBe(false);
  });

  it('enters grip editing on the selected frame away from its text, and its grip resizes it, undoably', () => {
    expect(report.selected).toBe('VBox');
    expect(report.grips).toBe(1);
    expect(report.draggable).toBe(true);
    expect(report.dragged).toBe(true);
    expect(report.ended).toBe(true);
    expect(Number(report.heightAfter)).toBeGreaterThan(Number(report.heightBefore));
    expect(report.heightAfterUndo).toBe(report.heightBefore);
  });
});
