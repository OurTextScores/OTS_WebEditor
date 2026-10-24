// Test the real JS/worker capability handshake without a browser or an engine build.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const root = new URL('../../webmscore-fork/web-public/src/', import.meta.url);
const index = (await readFile(new URL('index.js', root), 'utf8'))
  .replace(/^import [\s\S]*?from [^\n]+\n/gm, '').replace(/^export default WebMscore\s*;?$/m, 'globalThis.ScoreClass = WebMscore');
const worker = (await readFile(new URL('worker-helper.js', root), 'utf8'))
  .replace(/^import [\s\S]*?from [^\n]+\n/gm, '').replace(/^export default WebMscoreW\s*;?$/m, 'globalThis.WorkerClass = WebMscoreW');
const dispatch = (await readFile(new URL('worker.js', root), 'utf8')).replace(/^import [^\n]+\n/gm, '');
const methods = ['getSystemLockState', 'setSystemLock', 'moveSelectedMeasureToSystem'];
for (const supported of [false, true]) {
  const calls = [];
  const Module = { ccall: (...args) => { calls.push(args); return true; } };
  if (supported) for (const method of methods) Module[`_${method}`] = () => {};
  const ctx = vm.createContext({ Module, IS_NODE: true, console });
  vm.runInContext(index, ctx);
  const score = new ctx.ScoreClass(123);
  for (const method of methods) assert.equal(typeof score[method], supported ? 'function' : 'undefined');
  if (supported) {
    await score.setSystemLock(true);
    await score.moveSelectedMeasureToSystem('previous');
    await score.moveSelectedMeasureToSystem('next');
    assert.deepEqual(calls.map(call => Array.from(call[3])), [[123, 1, -1], [123, -1, -1], [123, 1, -1]]);
    assert.equal(await score.setSystemLock(1), false);
    assert.equal(await score.moveSelectedMeasureToSystem(1), false);
    assert.equal(calls.length, 3);
  }
  const workerCtx = vm.createContext({ console, TextDecoder, getSelfURL: () => 'test.js', shimDom() {},
    WebMscoreWorker() {}, Blob, URL: { createObjectURL: () => 'blob:test' }, Worker: class {} });
  vm.runInContext(worker, workerCtx);
  let reply;
  const dispatchCtx = vm.createContext({ console, Uint8Array,
    WebMscore: { ready: Promise.resolve(), load: async () => score, setLogLevel: async () => {} },
    self: { postMessage: (result) => { reply = result; } },
  });
  vm.runInContext(dispatch, dispatchCtx);
  const rpc = [];
  workerCtx.WorkerClass.prototype.rpc = async (method, args) => {
    rpc.push([method, args]);
    await dispatchCtx.self.onmessage({ data: { id: rpc.length, method, params: args } });
    if (reply.error) throw new Error(reply.error.message);
    return reply.result;
  };
  const proxy = await workerCtx.WorkerClass.load('mscz', new Uint8Array([1]));
  for (const method of methods) assert.equal(typeof proxy[method], supported ? 'function' : 'undefined');
  if (supported) {
    await proxy.setSystemLock(false);
    await proxy.moveSelectedMeasureToSystem('next');
    assert.equal(rpc.at(-2)[0], 'setSystemLock');
    assert.equal(rpc.at(-1)[0], 'moveSelectedMeasureToSystem');
  }
}
console.log('verified system-lock capability gating and arguments in real JS/worker wrappers');
