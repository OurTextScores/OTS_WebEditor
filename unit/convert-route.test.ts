import { describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  runMusicConvertService: vi.fn(),
}));

vi.mock('../lib/music-services/convert-service', () => ({
  runMusicConvertService: mocked.runMusicConvertService,
}));

import { MusicServiceError } from '../lib/music-services/errors';
import { POST } from '../app/api/music/convert/route';

describe('POST /api/music/convert route', () => {
  it('returns service payload and status on success', async () => {
    mocked.runMusicConvertService.mockResolvedValue({
      status: 201,
      body: { ok: true, outputArtifactId: 'out-1' },
    });

    const response = await POST(new Request('http://localhost/api/music/convert', {
      method: 'POST',
      body: JSON.stringify({ inputFormat: 'musicxml', outputFormat: 'abc' }),
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ ok: true, outputArtifactId: 'out-1' });
    expect(mocked.runMusicConvertService).toHaveBeenCalledTimes(1);
  });

  it('maps MusicServiceError to status and error payload', async () => {
    mocked.runMusicConvertService.mockRejectedValue(new MusicServiceError('bad input', 422));

    const response = await POST(new Request('http://localhost/api/music/convert', {
      method: 'POST',
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: 'bad input' });
  });

  it('maps generic tools-unavailable errors to 503', async () => {
    mocked.runMusicConvertService.mockRejectedValue(new Error('Tools unavailable in this runtime'));

    const response = await POST(new Request('http://localhost/api/music/convert', {
      method: 'POST',
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: 'Tools unavailable in this runtime' });
  });
});

