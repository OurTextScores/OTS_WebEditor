import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const workerRpcPath = '../webmscore-fork/web-public/src/worker-rpc.js';
const { cancelWorkerRpcs, sendWorkerRpc } = await import(workerRpcPath);

type Diagnostics = {
  pending: Record<string, { method: string; status: string }>;
  recent: Array<{ method: string; status: string; elapsedMs: number; errorName?: string }>;
};
const diagnostics = () => (window as unknown as { __webmscoreRpcDiagnostics: Diagnostics }).__webmscoreRpcDiagnostics;
class FakeWorker extends EventTarget {
  postMessage = vi.fn();
  reply(result: unknown) {
    const { id } = this.postMessage.mock.lastCall![0];
    this.dispatchEvent(new MessageEvent('message', { data: { id, result } }));
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  delete (window as unknown as { __webmscoreRpcDiagnostics?: Diagnostics }).__webmscoreRpcDiagnostics;
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('worker RPC diagnostics', () => {
  it('records completion without retaining arguments or results', async () => {
    const worker = new FakeWorker();
    const call = sendWorkerRpc(worker, 'saveXml', ['private score data']);
    expect(Object.values(diagnostics().pending)).toMatchObject([{ method: 'saveXml', status: 'pending' }]);
    vi.advanceTimersByTime(250);
    worker.reply('private result');
    await expect(call).resolves.toBe('private result');
    expect(diagnostics().pending).toEqual({});
    expect(diagnostics().recent).toMatchObject([{ method: 'saveXml', status: 'success', elapsedMs: 250 }]);
    expect(JSON.stringify(diagnostics())).not.toContain('private');
  });

  it('warns about an operation that remains pending and records its eventual completion', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const worker = new FakeWorker();
    const call = sendWorkerRpc(worker, 'saveXml');
    vi.advanceTimersByTime(15_000);
    expect(warn).toHaveBeenCalledWith('[webmscore-rpc] operation still pending', expect.objectContaining({ method: 'saveXml', elapsedMs: 15_000 }));
    worker.reply('done');
    await expect(call).resolves.toBe('done');
    expect(diagnostics().recent[0]).toMatchObject({ status: 'success', elapsedMs: 15_000 });
  });

  it('rejects every pending request when the worker emits an error', async () => {
    const worker = new FakeWorker();
    const first = sendWorkerRpc(worker, 'saveXml');
    const second = sendWorkerRpc(worker, 'saveSvg');
    const firstResult = expect(first).rejects.toThrow('WebMscore worker failed during saveXml: crash');
    const secondResult = expect(second).rejects.toThrow('WebMscore worker failed during saveSvg: crash');
    worker.dispatchEvent(new ErrorEvent('error', { message: 'crash' }));
    await Promise.all([firstResult, secondResult]);
    expect(Object.keys(diagnostics().pending)).toHaveLength(0);
    expect(diagnostics().recent.map((item) => item.status)).toEqual(['worker-error', 'worker-error']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects pending calls on deliberate worker termination', async () => {
    const worker = new FakeWorker();
    const call = sendWorkerRpc(worker, 'saveXml');
    const result = expect(call).rejects.toThrow('worker terminated during saveXml');
    cancelWorkerRpcs(worker);
    await result;
    expect(diagnostics().recent[0].status).toBe('terminated');
    expect(diagnostics().pending).toEqual({});
    expect(vi.getTimerCount()).toBe(0);
  });

  it('handles remote errors, message errors, and failed sends', async () => {
    const worker = new FakeWorker();
    const remote = sendWorkerRpc(worker, 'saveXml');
    const remoteResult = expect(remote).rejects.toMatchObject({ name: 'WasmError', message: 'failed', originalStack: 'native stack' });
    worker.dispatchEvent(new MessageEvent('message', { data: { id: worker.postMessage.mock.lastCall![0].id, error: { name: 'WasmError', message: 'failed', stack: 'native stack' } } }));
    await remoteResult;
    const invalidMessage = sendWorkerRpc(worker, 'load');
    const messageResult = expect(invalidMessage).rejects.toThrow('message could not be decoded');
    worker.dispatchEvent(new MessageEvent('messageerror'));
    await messageResult;
    worker.postMessage.mockImplementationOnce(() => { throw new Error('post failed'); });
    await expect(sendWorkerRpc(worker, 'ready')).rejects.toThrow('post failed');
    expect(diagnostics().recent.map((item) => item.status)).toEqual(['error', 'message-error', 'send-error']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('decodes transferred SVG and bounds the completed history', async () => {
    const worker = new FakeWorker();
    const svg = sendWorkerRpc(worker, 'saveSvg');
    worker.reply({ __webmscoreSvgUtf8: new Uint8Array([60, 115, 118, 103, 47, 62]) });
    await expect(svg).resolves.toBe('<svg/>');
    for (let i = 0; i < 205; i++) {
      const call = sendWorkerRpc(worker, 'ready');
      worker.reply('done');
      await call;
    }
    expect(diagnostics().recent).toHaveLength(200);
    expect(diagnostics().recent.every((item) => item.method === 'ready')).toBe(true);
  });
});
