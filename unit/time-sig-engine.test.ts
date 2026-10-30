import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Time Signature Properties, through the Node build (scripts/time-sig-probe.mjs). The Node build is a
// local artefact (webmscore-fork/web-public, untracked), so this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

function probe(): Record<string, unknown> {
  // The engine's Node build expects stdout to be a file or pipe, not the socket Node uses for child-process pipes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'time-sig-'));
  const output = path.join(dir, 'report.txt');
  const fd = fs.openSync(output, 'w');
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts/time-sig-probe.mjs')], {
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

describe.skipIf(!fs.existsSync(nodeBuild))('Time Signature Properties in the engine', () => {
  const report = fs.existsSync(nodeBuild) ? probe() : {};
  type Props = { type?: string; numeratorText?: string; groups?: { eighth: string }; defaultGroups?: { eighth: string } };
  const initial = report.initial as Props;

  it('reads nothing without a selected time signature, and the dialog values with one', () => {
    expect(report.none).toEqual({});
    expect(report.found).toBe(true);
    expect(initial).toMatchObject({ type: 'normal', numerator: 3, denominator: 4, numeratorText: '' });
    // 3/4: six eighths, beamed in pairs (a beam per beat) by MuseScore's defaults.
    expect(initial.groups?.eighth).toBe('001010');
    expect(initial.groups).toEqual(initial.defaultGroups);
  });

  it('sets the text and the beam groups, which re-beam the score', () => {
    expect(report.set).toBe(true);
    const after = report.after as Props;
    expect(after.numeratorText).toBe('3');
    expect(after.groups?.eighth).toBe('111111');
    expect(report.beamsAfter as number).toBeLessThan(report.beamsBefore as number);
    expect(report.badType).toBe(false);
  });

  it('resets to the defaults, and undo restores the original', () => {
    expect(report.reset).toEqual(initial.defaultGroups);
    expect(report.afterUndo).toEqual(initial);
    expect(report.beamsAfterUndo).toBe(report.beamsBefore);
  });
});
