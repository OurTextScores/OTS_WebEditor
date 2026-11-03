import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// MNX interchange (roadmap E29): MuseScore's own MNX tests (src/importexport/mnx/tests: its project examples and the
// W3C examples, copied to tools/musescore/fixtures/mnx-conformance) through the Node build
// (scripts/mnx-conformance-probe.mjs): each file imports to MuseScore's reference score, and the ones MuseScore
// round-trips export and import back to it. The Node build is a local artefact (webmscore-fork/web-public,
// untracked), so this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

function probe(mode: '--all' | '--refusals'): Record<string, unknown> {
  // The engine's Node build expects stdout to be a file or pipe, not the socket Node uses for child-process pipes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnx-conformance-'));
  const output = path.join(dir, 'report.txt');
  const fd = fs.openSync(output, 'w');
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts/mnx-conformance-probe.mjs'), mode], {
      cwd: root,
      stdio: ['ignore', fd, 'pipe'],
      timeout: 600_000,
    });
    return JSON.parse(fs.readFileSync(output, 'utf8').trim().split('\n').pop() ?? '{}');
  } finally {
    fs.closeSync(fd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe.skipIf(!fs.existsSync(nodeBuild))('MNX import and export in the engine', () => {
  const report = fs.existsSync(nodeBuild) ? probe('--all') : {};

  it("imports every one of MuseScore's enabled MNX test files to its reference score", () => {
    expect(report.total).toBe(71);
    expect(report.imported).toBe(report.total);
    expect(report.importMatch).toBe(report.total);
  });

  it('round-trips through MNX export every file MuseScore round-trips', () => {
    expect(report.roundTrips).toBe(62);
    expect(report.roundTripMatch).toBe(report.roundTrips);
    expect(report.failures).toEqual([]);
  });

  it('refuses bad input with a message, and the engine keeps working', () => {
    // mnxdom and nlohmann::json throw; mnxio.cpp catches, so the bridge answers instead of aborting.
    const refusals = probe('--refusals');
    expect(refusals.malformed).toMatch(/parse error/);
    expect(refusals.invalid).toMatch(/File is not a valid MNX document\./);
    expect(refusals.loadsAfterwards).toBe(1);
  });
});
