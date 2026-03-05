import { describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  runHarmonyAnalyzeService: vi.fn(),
}));

vi.mock('../lib/music-services/harmony-service', () => ({
  runHarmonyAnalyzeService: mocked.runHarmonyAnalyzeService,
}));

import { MusicServiceError } from '../lib/music-services/errors';
import { POST } from '../app/api/music/harmony/analyze/route';

describe('POST /api/music/harmony/analyze route', () => {
  it('returns service payload and status on success', async () => {
    mocked.runHarmonyAnalyzeService.mockResolvedValue({
      status: 200,
      body: { ok: true, engine: 'music21' },
    });

    const response = await POST(new Request('http://localhost/api/music/harmony/analyze', {
      method: 'POST',
      body: JSON.stringify({ content: '<score-partwise />' }),
      headers: { 'Content-Type': 'application/json' },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, engine: 'music21' });
  });

  it('maps MusicServiceError to status and error payload', async () => {
    mocked.runHarmonyAnalyzeService.mockRejectedValue(new MusicServiceError('bad input', 422));

    const response = await POST(new Request('http://localhost/api/music/harmony/analyze', {
      method: 'POST',
      body: JSON.stringify({ content: '<score-partwise />' }),
      headers: { 'Content-Type': 'application/json' },
    }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: 'bad input' });
  });
});
