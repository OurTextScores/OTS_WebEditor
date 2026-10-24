// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadWebMscoreInProcess } from '../lib/webmscore-loader';

// The editor API's server-side engine (deep edit, scoreops, compare): the real WASM through the in-process Node
// runtime, not a mock. Its asset lookup broke silently once; every other test mocks this loader.
// CI's unit job checks out without Git LFS, so the engine files are pointer stubs there: run only with a real engine
const WASM_MAGIC = '0061736d';
const hasEngine = ['webmscore-fork/web-public/webmscore.lib.wasm', 'public/webmscore.lib.wasm'].some(
  (file) => existsSync(file) && readFileSync(file).subarray(0, 4).toString('hex') === WASM_MAGIC,
);

describe('in-process webmscore under Node', () => {
  it.skipIf(!hasEngine)('loads a score and exports MusicXML', async () => {
    const engine = await loadWebMscoreInProcess();
    const data = new Uint8Array(readFileSync('public/test_scores/three_notes_cde.musicxml'));
    const score = await engine.load('musicxml', data);
    try {
      expect(await score.npages()).toBe(1);
      expect(await score.saveXml()).toMatch(/<score-partwise[\s\S]*<step>E<\/step>/);
    } finally {
      score.destroy();
    }
  }, 120_000);
});
