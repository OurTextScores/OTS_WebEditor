import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { convertMusicNotation } from '../lib/music-conversion';

// Server-side MNX conversion (roadmap E29): MusicXML <-> MNX through MuseScore's command line (4.7+), with the deep
// validation's round trip and render. MuseScore is not installed where the unit tests run, so its command line is
// scripts/webmscore-cli-shim.mjs on the engine's Node build (the same MEI module), which is a local artefact
// (webmscore-fork/web-public, untracked): this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');
const shim = path.join(root, 'scripts/webmscore-cli-shim.mjs');
const musicXml = fs.readFileSync(path.join(root, 'unit/fixtures/eight-bars.musicxml'), 'utf8');

const ENV = {
  MUSIC_MUSESCORE_BIN: shim,
  MUSIC_MUSESCORE_BIN_CANDIDATES: shim,
  MUSIC_MUSESCORE_USE_XVFB: 'false',
};
const saved: Record<string, string | undefined> = {};

describe.skipIf(!fs.existsSync(nodeBuild))('MNX conversion on the server', () => {
  beforeAll(() => {
    for (const [key, value] of Object.entries(ENV)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
  });
  afterAll(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('converts MusicXML to MNX, and the deep validation round trip and render pass', async () => {
    const result = await convertMusicNotation({
      inputFormat: 'musicxml',
      outputFormat: 'mnx',
      content: musicXml,
      filename: 'eight-bars.musicxml',
      timeoutMs: 120_000,
    });
    expect(result.outputFormat).toBe('mnx');
    expect(JSON.parse(result.content).mnx.version).toEqual(expect.any(Number));
    const failed = result.validation.checks.filter((check) => !check.ok).map((check) => check.id);
    expect(failed).toEqual([]);
    expect(result.validation.checks.map((check) => check.id)).toEqual(
      expect.arrayContaining([
        'mnx-root',
        'invariant-meter-present',
        'roundtrip-step-2-convert',
        'render-smoke-musescore-pdf',
      ]),
    );
  }, 180_000);

  it('converts MNX back to MusicXML with the same bars and notes', async () => {
    const mnx = await convertMusicNotation({
      inputFormat: 'musicxml',
      outputFormat: 'mnx',
      content: musicXml,
      validate: false,
      timeoutMs: 120_000,
    });
    const back = await convertMusicNotation({
      inputFormat: 'mnx',
      outputFormat: 'musicxml',
      content: mnx.content,
      timeoutMs: 120_000,
    });
    expect(back.content).toMatch(/<score-partwise\b/);
    const failed = back.validation.checks.filter((check) => !check.ok).map((check) => check.id);
    expect(failed).toEqual([]);
    const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;
    expect(count(back.content, /<measure\b/g)).toBe(count(musicXml, /<measure\b/g));
    expect(count(back.content, /<pitch>/g)).toBe(count(musicXml, /<pitch>/g));
  }, 240_000);
});
