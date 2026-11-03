import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Rich text (roadmap E17), through the Node build (scripts/rich-text-probe.mjs). The Node build is a
// local artefact (webmscore-fork/web-public, untracked), so this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

function probe(): Record<string, unknown> {
  // The engine's Node build expects stdout to be a file or pipe, not the socket Node uses for child-process pipes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rich-text-'));
  const output = path.join(dir, 'report.txt');
  const fd = fs.openSync(output, 'w');
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts/rich-text-probe.mjs')], {
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

describe.skipIf(!fs.existsSync(nodeBuild))('rich text in the engine', () => {
  const report = fs.existsSync(nodeBuild) ? probe() : {};

  it('sets a text from MuseScore markup and keeps every span’s formatting', () => {
    expect(report.found).toBe(true);
    expect(report.before).toBe('Dolce');
    expect(report.set).toBe(true);
    expect(report.after).toBe('<b>Dol</b><i>ce</i> <font face="FreeSans"/>x<sup>2</sup>');
  });

  it('repairs stray < and & as MuseScore does, and undoes', () => {
    expect(report.repaired).toBe(true);
    expect(report.afterRepair).toBe('a &lt; b &amp; c');
    expect(report.afterUndo).toBe(report.after);
  });
});
