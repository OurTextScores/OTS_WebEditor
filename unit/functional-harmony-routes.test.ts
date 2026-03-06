import { describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  runFunctionalHarmonyAnalyzeService: vi.fn(),
}));

vi.mock('../lib/music-services/functional-harmony-service', () => ({
  runFunctionalHarmonyAnalyzeService: mocked.runFunctionalHarmonyAnalyzeService,
}));

import { MusicServiceError } from '../lib/music-services/errors';
import { POST } from '../app/api/music/functional-harmony/analyze/route';

describe('POST /api/music/functional-harmony/analyze route', () => {
  it('returns service payload and status on success', async () => {
    mocked.runFunctionalHarmonyAnalyzeService.mockResolvedValue({
      status: 200,
      body: { ok: true, engine: 'music21-roman' },
    });

    const response = await POST(new Request('http://localhost/api/music/functional-harmony/analyze', {
      method: 'POST',
      body: JSON.stringify({ content: '<score-partwise />' }),
      headers: { 'Content-Type': 'application/json' },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, engine: 'music21-roman' });
  });

  it('maps MusicServiceError to status and error payload', async () => {
    mocked.runFunctionalHarmonyAnalyzeService.mockRejectedValue(new MusicServiceError('bad input', 422));

    const response = await POST(new Request('http://localhost/api/music/functional-harmony/analyze', {
      method: 'POST',
      body: JSON.stringify({ content: '<score-partwise />' }),
      headers: { 'Content-Type': 'application/json' },
    }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: 'bad input' });
  });
});
