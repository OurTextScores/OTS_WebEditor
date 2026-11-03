import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// MEI interchange (roadmap E25): MuseScore's own MEI conformance tests (src/importexport/mei/tests, copied to
// tools/musescore/fixtures/mei-conformance) through the Node build (scripts/mei-conformance-probe.mjs): each file
// imports to MuseScore's reference score and exports back to itself. The Node build is a local artefact
// (webmscore-fork/web-public, untracked), so this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

function probe(): Record<string, unknown> {
  // The engine's Node build expects stdout to be a file or pipe, not the socket Node uses for child-process pipes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mei-conformance-'));
  const output = path.join(dir, 'report.txt');
  const fd = fs.openSync(output, 'w');
  try {
    execFileSync(
      process.execPath,
      [path.join(root, 'scripts/mei-conformance-probe.mjs'), '--all'],
      {
        cwd: root,
        stdio: ['ignore', fd, 'pipe'],
        timeout: 600_000,
      },
    );
    return JSON.parse(fs.readFileSync(output, 'utf8').trim().split('\n').pop() ?? '{}');
  } finally {
    fs.closeSync(fd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe.skipIf(!fs.existsSync(nodeBuild))('MEI import and export in the engine', () => {
  const report = fs.existsSync(nodeBuild) ? probe() : {};

  it("imports every one of MuseScore's MEI test files to its reference score", () => {
    expect(report.total).toBe(64);
    expect(report.imported).toBe(report.total);
    expect(report.mscxMatch).toBe(report.total);
  });

  it('exports each imported score back to the MEI it came from', () => {
    expect(report.meiMatch).toBe(report.total);
    expect(report.failures).toEqual([]);
  });
});
