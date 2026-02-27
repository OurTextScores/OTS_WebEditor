import { describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  runMusicContextService: vi.fn(),
}));

vi.mock('../lib/music-services/context-service', () => ({
  runMusicContextService: mocked.runMusicContextService,
}));

import { MusicServiceError } from '../lib/music-services/errors';
import { POST } from '../app/api/music/context/route';

describe('POST /api/music/context route', () => {
  it('returns service payload and status on success', async () => {
    mocked.runMusicContextService.mockResolvedValue({
      status: 200,
      body: {
        strategy: 'musicxml-primary',
        context: { format: 'musicxml' },
      },
    });

    const response = await POST(new Request('http://localhost/api/music/context', {
      method: 'POST',
      body: JSON.stringify({ content: '<score-partwise />' }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      strategy: 'musicxml-primary',
      context: { format: 'musicxml' },
    });
  });

  it('maps MusicServiceError to status and error payload', async () => {
    mocked.runMusicContextService.mockRejectedValue(new MusicServiceError('invalid range', 400));

    const response = await POST(new Request('http://localhost/api/music/context', {
      method: 'POST',
      body: JSON.stringify({ measureStart: 10, measureEnd: 2 }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid range' });
  });

  it('maps unexpected errors to 500', async () => {
    mocked.runMusicContextService.mockRejectedValue(new Error('unexpected failure'));

    const response = await POST(new Request('http://localhost/api/music/context', {
      method: 'POST',
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: 'unexpected failure' });
  });
});

