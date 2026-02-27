import { describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  runMusicGenerateService: vi.fn(),
}));

vi.mock('../lib/music-services/generate-service', () => ({
  runMusicGenerateService: mocked.runMusicGenerateService,
}));

import { POST } from '../app/api/music/generate/route';

describe('POST /api/music/generate route', () => {
  it('returns service payload and status on success', async () => {
    mocked.runMusicGenerateService.mockResolvedValue({
      status: 200,
      body: { specialist: 'notagen', generation: null },
    });

    const response = await POST(new Request('http://localhost/api/music/generate', {
      method: 'POST',
      body: JSON.stringify({ dryRun: true }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      specialist: 'notagen',
      generation: null,
    });
  });

  it('returns service-provided error status and payload', async () => {
    mocked.runMusicGenerateService.mockResolvedValue({
      status: 422,
      body: { error: 'Generated ABC failed validation.' },
    });

    const response = await POST(new Request('http://localhost/api/music/generate', {
      method: 'POST',
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Generated ABC failed validation.',
    });
  });
});

