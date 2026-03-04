import { describe, expect, it, vi } from 'vitest';

describe('loadWebMscore', () => {
  it('initializes once and returns the same instance', async () => {
    vi.resetModules();

    const ready = Promise.resolve();
    const mockLoad = vi.fn();
    const mockWebMscore = { ready, load: mockLoad };

    vi.doMock('../webmscore-fork/web-public/webmscore.webpack.mjs', () => ({ default: mockWebMscore }));

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

    vi.doMock('../webmscore-fork/web-public/webmscore.webpack.mjs', () => ({ default: { default: mockWebMscore } }));

    const { loadWebMscore } = await import('../lib/webmscore-loader');
    const instance = await loadWebMscore();

    expect(instance).toBe(mockWebMscore);
  });
});
