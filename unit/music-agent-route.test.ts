import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  runMusicAgentRouter: vi.fn(),
}));

vi.mock('../lib/music-agents/router', () => ({
  runMusicAgentRouter: mocked.runMusicAgentRouter,
}));

import { POST } from '../app/api/music/agent/route';

describe('POST /api/music/agent route', () => {
  /*
      The route only reaches the router when it would not be spending a server
      key: with one configured it demands app-token access first and answers
      403. That is real behaviour, covered below — but it must be asked for,
      not inherited from whatever keys happen to sit in the developer's shell.
      Without this the suite passes on CI and fails on any machine with an
      OPENAI_API_KEY exported.
  */
  const priorOpenAiKey = process.env.OPENAI_API_KEY;
  const priorAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const priorAllowServerKeys = process.env.ALLOW_SERVER_LLM_KEYS;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ALLOW_SERVER_LLM_KEYS;
  });

  const restore = (name: string, prior: string | undefined) => {
    if (prior === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = prior;
    }
  };

  afterEach(() => {
    restore('OPENAI_API_KEY', priorOpenAiKey);
    restore('ANTHROPIC_API_KEY', priorAnthropicKey);
    restore('ALLOW_SERVER_LLM_KEYS', priorAllowServerKeys);
  });

  it('returns service payload and status', async () => {
    mocked.runMusicAgentRouter.mockResolvedValue({
      status: 200,
      body: {
        mode: 'fallback',
        selectedTool: 'music.context',
      },
    });

    const response = await POST(
      new Request('http://localhost/api/music/agent', {
        method: 'POST',
        body: JSON.stringify({ prompt: 'analyze this score' }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      mode: 'fallback',
      selectedTool: 'music.context',
    });
  });

  it('returns service error payload and status', async () => {
    mocked.runMusicAgentRouter.mockResolvedValue({
      status: 400,
      body: { error: 'Missing prompt for music agent router.' },
    });

    const response = await POST(
      new Request('http://localhost/api/music/agent', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Missing prompt for music agent router.',
    });
  });

  it('refuses to spend a server key before the router is ever reached', async () => {
    process.env.OPENAI_API_KEY = 'server-key';

    const response = await POST(
      new Request('http://localhost/api/music/agent', {
        method: 'POST',
        body: JSON.stringify({ prompt: 'analyze this score' }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'server_credentials_disabled',
    });
    expect(mocked.runMusicAgentRouter).not.toHaveBeenCalled();
  });

  it('reaches the router on a server key when the caller brought its own', async () => {
    process.env.OPENAI_API_KEY = 'server-key';
    mocked.runMusicAgentRouter.mockResolvedValue({
      status: 200,
      body: { mode: 'fallback', selectedTool: 'music.context' },
    });

    const response = await POST(
      new Request('http://localhost/api/music/agent', {
        method: 'POST',
        body: JSON.stringify({ prompt: 'analyze this score', apiKey: 'caller-key' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocked.runMusicAgentRouter).toHaveBeenCalled();
  });
});
