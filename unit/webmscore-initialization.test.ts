import { afterEach, describe, expect, it, vi } from 'vitest';

const libPath = '../webmscore-fork/web-public/webmscore.lib.js';
const helperPath = '../webmscore-fork/web-public/src/helper.js';

afterEach(() => {
  vi.doUnmock(libPath);
  vi.resetModules();
});

describe('webmscore initialization', () => {
  it('rejects readiness when native initialization traps', async () => {
    const failure = new WebAssembly.RuntimeError('native initialization failed');
    vi.doMock(libPath, () => ({
      default: () => Promise.resolve({ ccall: () => { throw failure; } }),
    }));
    const { RuntimeInitialized } = await import(helperPath);
    await expect(RuntimeInitialized).rejects.toBe(failure);
  });

  it('rejects readiness when the WebAssembly module cannot start', async () => {
    const failure = new Error('module startup failed');
    vi.doMock(libPath, () => ({ default: () => Promise.reject(failure) }));
    const { RuntimeInitialized } = await import(helperPath);
    await expect(RuntimeInitialized).rejects.toBe(failure);
  });
});
