import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrowserContext } from 'playwright/test';
import { collectWorkerRpcDiagnostics } from '../tests/helpers/worker-rpc-artifact';

const fakeContext = (frames: Array<{ evaluate: (fn: () => unknown) => Promise<unknown> }>) =>
  ({ pages: () => [{ frames: () => frames }] }) as unknown as BrowserContext;

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { __webmscoreRpcDiagnostics?: unknown }).__webmscoreRpcDiagnostics;
});

describe('worker RPC failure artifact', () => {
  it('captures allowed metadata and omits request and response contents', async () => {
    (window as unknown as { __webmscoreRpcDiagnostics: unknown }).__webmscoreRpcDiagnostics = {
      pending: { 1: { id: 1, method: 'saveXml', startedAt: 10, endedAt: null, elapsedMs: null, status: 'pending', params: 'SECRET_SCORE' } },
      recent: [
        { id: 2, method: 'load', startedAt: 5, endedAt: 8, elapsedMs: 3, status: 'success', result: 'SECRET_RESULT' },
        { id: 3, method: 'not a valid method', status: 'error' },
      ],
    };
    const report = await collectWorkerRpcDiagnostics(fakeContext([{ evaluate: async (fn) => fn() }]));
    expect(report.frames[0]).toMatchObject({ state: 'captured', diagnostics: {
      pending: [{ id: 1, method: 'saveXml', status: 'pending' }],
      recent: [{ id: 2, method: 'load', status: 'success', elapsedMs: 3 }],
    } });
    expect(JSON.stringify(report)).not.toContain('SECRET');
  });

  it('records closed or unresponsive frames without blocking failure reporting', async () => {
    vi.useFakeTimers();
    const report = collectWorkerRpcDiagnostics(fakeContext([
      { evaluate: async () => { throw new Error('page closed'); } },
      { evaluate: () => new Promise(() => {}) },
    ]));
    await vi.advanceTimersByTimeAsync(2_000);
    expect((await report).frames.map((frame) => frame.state)).toEqual(['unavailable', 'timed-out']);
  });

  it('bounds the number of captured frames', async () => {
    const frames = Array.from({ length: 20 }, () => ({ evaluate: async () => null }));
    const report = await collectWorkerRpcDiagnostics(fakeContext(frames));
    expect(report.frames).toHaveLength(16);
    expect(report.omittedFrames).toBe(4);
  });
});
