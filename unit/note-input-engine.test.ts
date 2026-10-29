import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Input by duration (roadmap E11), through the Node build (scripts/note-input-probe.mjs). The Node build is a
// local artefact (webmscore-fork/web-public, untracked), so this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

function probe(): Record<string, unknown> {
  // The engine's Node build expects stdout to be a file or pipe, not the socket Node uses for child-process pipes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-input-'));
  const output = path.join(dir, 'report.txt');
  const fd = fs.openSync(output, 'w');
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts/note-input-probe.mjs')], {
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

describe.skipIf(!fs.existsSync(nodeBuild))('input by duration in the engine', () => {
  const report = fs.existsSync(nodeBuild) ? probe() : {};

  it('sets the pitch with a letter, entering nothing', () => {
    expect(report.method).toBe(true);
    expect(report.letter).toBe(true);
    expect(report.afterLetter).toEqual(report.before);
  });

  it('enters that pitch with each duration key', () => {
    expect(report.duration).toBe(true);
    expect((report.afterDuration as string[]).filter((p) => p === 'E4')).toHaveLength(1);
    expect((report.afterSecond as string[]).filter((p) => p === 'E4')).toHaveLength(2);
  });
});
