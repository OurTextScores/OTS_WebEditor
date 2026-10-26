// Exercise real wrapper source with old/mixed native artifacts, without invoking a missing export.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const root = new URL('../../webmscore-fork/web-public/src/', import.meta.url);
const index = (await readFile(new URL('index.js', root), 'utf8'))
  .replace(/^import [\s\S]*?from [^\n]+\n/gm, '')
  .replace(/^export default WebMscore\s*;?$/m, 'globalThis.ScoreClass = WebMscore');
const worker = (await readFile(new URL('worker-helper.js', root), 'utf8'))
  .replace(/^import [\s\S]*?from [^\n]+\n/gm, '')
  .replace(/^export default WebMscoreW\s*;?$/m, 'globalThis.WorkerClass = WebMscoreW');

for (const supported of [false, true]) {
  const calls = [], order = [];
  const Module = {
    ccall: (...args) => { calls.push(args); order.push(args[0]); return 1; },
    FS_unlink: () => order.push('unlink'),
    FS_createDataFile: () => order.push('write'),
  };
  if (supported) {
    Module._playbackCapabilities = () => {};
    Module._invalidateSoundFont = () => {};
  }
  if (supported) Module._warmupPlayback = () => {};
  const caps = { schemaVersion: 1, streamHandlesVersion: 1, partialLayoutSafe: true };
  const ctx = vm.createContext({ Module, IS_NODE: true, console, WasmRes: { readText: () => JSON.stringify(caps) } });
  vm.runInContext(index, ctx);
  const score = new ctx.ScoreClass(123);
  assert.deepEqual(JSON.parse(JSON.stringify(await score.playbackCapabilities())), supported ? caps : null);
  if (supported) assert.deepEqual(Array.from(calls[0][3]), [123, -1]);
  else assert.equal(calls.length, 0);
  assert.equal(await score.warmupPlayback(), supported);
  assert.equal(await score.playbackDiagnostics(), null, 'absent diagnostic export is never called');
  assert.equal(await score.setPlaybackReuse(false), false, 'old native has no reuse control');
  order.length = 0;
  await ctx.ScoreClass.setSoundFont(new Uint8Array([1]));
  await ctx.ScoreClass.setSoundFont(new Uint8Array([2]));
  assert.deepEqual(order, supported
    ? ['invalidateSoundFont', 'write', 'invalidateSoundFont', 'unlink', 'write']
    : ['write', 'unlink', 'write']);
  if (supported) {
    order.length = 0;
    Module.ccall = () => 0;
    await assert.rejects(ctx.ScoreClass.setSoundFont(new Uint8Array([3])), /native voices/);
    assert.deepEqual(order, [], 'failed invalidation cannot overwrite the previous font');
  }
}

const workerCtx = vm.createContext({ console, TextDecoder, getSelfURL: () => 'test.js', shimDom() {},
  WebMscoreWorker() {}, Blob, URL: { createObjectURL: () => 'blob:test' }, Worker: class {} });
vm.runInContext(worker, workerCtx);
const proxy = new workerCtx.WorkerClass();
proxy.rpc = async (method, args) => { assert.equal(method, 'playbackCapabilities'); assert.equal(args, undefined); return null; };
assert.equal(await proxy.playbackCapabilities(), null);
console.log('verified playback capability fallback and ordered native soundfont invalidation in JS/worker wrappers');
