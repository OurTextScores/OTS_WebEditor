import { afterEach, describe, expect, it, vi } from 'vitest';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});

describe('loadWebMscore', () => {
  it('initializes once and returns the same instance', async () => {
    vi.resetModules();

    const ready = Promise.resolve();
    const mockLoad = vi.fn();
    const mockWebMscore = { ready, load: mockLoad };

    vi.doMock('../webmscore-fork/web-public/webmscore.webpack.mjs', () => ({
      default: mockWebMscore,
    }));

    const { loadWebMscore } = await import('../lib/webmscore-loader');

    const first = await loadWebMscore();
    const second = await loadWebMscore();

    expect(first).toBe(mockWebMscore);
    expect(second).toBe(mockWebMscore);
  });

  it('supports nested default interop shape', async () => {
    vi.resetModules();

    const ready = Promise.resolve();
    const mockLoad = vi.fn();
    const mockWebMscore = { ready, load: mockLoad };

    vi.doMock('../webmscore-fork/web-public/webmscore.webpack.mjs', () => ({
      default: { default: mockWebMscore },
    }));

    const { loadWebMscore } = await import('../lib/webmscore-loader');
    const instance = await loadWebMscore();

    expect(instance).toBe(mockWebMscore);
  });

  it('restores global fetch before waiting for in-process initialization', async () => {
    vi.resetModules();
    vi.stubGlobal('window', undefined);

    const stableFetch = vi.fn() as unknown as typeof fetch;
    globalThis.fetch = stableFetch;

    let resolveReady: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });

    vi.doMock('../webmscore-fork/web-public/src/nodejs.js', () => {
      globalThis.fetch = undefined as unknown as typeof fetch;
      return {
        default: {
          ready,
          load: vi.fn(),
        },
      };
    });

    const { loadWebMscoreInProcess } = await import('../lib/webmscore-loader');

    const initialization = loadWebMscoreInProcess();
    await vi.waitFor(() => expect(globalThis.fetch).toBe(stableFetch));

    resolveReady?.();
    await expect(initialization).resolves.toBeDefined();
    expect(globalThis.fetch).toBe(stableFetch);
  });
});
