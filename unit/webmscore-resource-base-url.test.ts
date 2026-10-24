import { afterEach, describe, expect, it, vi } from 'vitest';

// The engine fetches fonts it does not preload from NEXT_PUBLIC_WEBMSCORE_RESOURCE_BASE_URL (the 4.7 engine); the
// loader must hand that URL to the engine class before any score loads
const engine = vi.hoisted(() => ({
  default: { ready: Promise.resolve(), load: vi.fn(), resourceBaseUrl: undefined as string | undefined },
}));
vi.mock('../lib/webmscore-worker-runtime.js', () => engine);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  engine.default.resourceBaseUrl = undefined;
});

describe('webmscore resource base URL', () => {
  it('reads the env value and ends it with a slash so resource paths resolve below it', async () => {
    const { webMscoreResourceBaseUrl } = await import('../lib/webmscore-loader');
    vi.stubEnv('NEXT_PUBLIC_WEBMSCORE_RESOURCE_BASE_URL', '');
    expect(webMscoreResourceBaseUrl()).toBeUndefined();
    vi.stubEnv('NEXT_PUBLIC_WEBMSCORE_RESOURCE_BASE_URL', ' https://cdn.example.org/webmscore/4.7.4 ');
    expect(webMscoreResourceBaseUrl()).toBe('https://cdn.example.org/webmscore/4.7.4/');
  });

  it('prefers the server runtime setting (the editor API image has no NEXT_PUBLIC_ values)', async () => {
    const { webMscoreResourceBaseUrl } = await import('../lib/webmscore-loader');
    vi.stubEnv('NEXT_PUBLIC_WEBMSCORE_RESOURCE_BASE_URL', 'https://public.example.org/r/');
    vi.stubEnv('WEBMSCORE_RESOURCE_BASE_URL', 'https://server.example.org/r');
    expect(webMscoreResourceBaseUrl()).toBe('https://server.example.org/r/');
    vi.stubEnv('WEBMSCORE_RESOURCE_BASE_URL', '');
    expect(webMscoreResourceBaseUrl()).toBe('https://public.example.org/r/');
  });

  it('sets it on the engine when the worker runtime loads', async () => {
    vi.stubEnv('NEXT_PUBLIC_WEBMSCORE_RESOURCE_BASE_URL', 'https://cdn.example.org/webmscore/4.7.4/');
    const { loadWebMscore } = await import('../lib/webmscore-loader');
    const loaded = await loadWebMscore();
    expect(loaded.resourceBaseUrl).toBe('https://cdn.example.org/webmscore/4.7.4/');
  });

  it('leaves the engine alone when unset', async () => {
    const { loadWebMscore } = await import('../lib/webmscore-loader');
    const loaded = await loadWebMscore();
    expect(loaded.resourceBaseUrl).toBeUndefined();
  });
});
