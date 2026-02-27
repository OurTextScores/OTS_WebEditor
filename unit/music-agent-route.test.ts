import { describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  runMusicAgentRouter: vi.fn(),
}));

vi.mock('../lib/music-agents/router', () => ({
  runMusicAgentRouter: mocked.runMusicAgentRouter,
}));

import { POST } from '../app/api/music/agent/route';

describe('POST /api/music/agent route', () => {
  it('returns service payload and status', async () => {
    mocked.runMusicAgentRouter.mockResolvedValue({
      status: 200,
      body: {
        mode: 'fallback',
        selectedTool: 'music.context',
      },
    });

    const response = await POST(new Request('http://localhost/api/music/agent', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'analyze this score' }),
    }));

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

    const response = await POST(new Request('http://localhost/api/music/agent', {
      method: 'POST',
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Missing prompt for music agent router.',
    });
  });
});

