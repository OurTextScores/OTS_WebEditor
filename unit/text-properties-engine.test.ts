import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Text properties for the Properties panel, through the Node build (scripts/text-properties-probe.mjs). The Node build is a
// local artefact (webmscore-fork/web-public, untracked), so this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

function probe(): Record<string, unknown> {
  // The engine's Node build expects stdout to be a file or pipe, not the socket Node uses for child-process pipes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'text-properties-'));
  const output = path.join(dir, 'report.txt');
  const fd = fs.openSync(output, 'w');
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts/text-properties-probe.mjs')], {
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

describe.skipIf(!fs.existsSync(nodeBuild))('text properties in the engine', () => {
  const report = fs.existsSync(nodeBuild) ? probe() : {};

  it('reads a staff text’s font, size, style flags, alignment, frame and text style', () => {
    expect(report.found).toBe(true);
    expect(report.before).toMatchObject({ style: 'staff', family: 'Edwin', size: '10', fontStyle: '0', frameType: '0' });
    expect((report.before as { align: string }).align).toMatch(/^[a-z]+,[a-z]+$/);
    expect((report.before as { frameBgColor: string }).frameBgColor).toMatch(/^#[0-9A-F]{8}$/);
  });

  it('sets each, refusing malformed tokens, and resets one to its text style', () => {
    expect(report.sets).toEqual({
      family: true,
      size: true,
      fontStyle: true,
      align: true,
      frameType: true,
      frameBgColor: true,
      badColor: false,
      badAlign: false,
    });
    expect(report.after).toMatchObject({
      family: 'FreeSans',
      size: '14',
      fontStyle: '3',
      align: 'center,bottom',
      frameType: '1',
      frameBgColor: '#FFFF0080',
    });
    expect(report.afterReset).toBe('10');
  });

  it('changes the text style, which applies that style (expression text is italic)', () => {
    expect(report.styleChange).toBe(true);
    expect(report.afterStyle).toMatchObject({ style: 'expression', fontStyle: '2' });
  });
});
