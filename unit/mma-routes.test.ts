import { describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  runMmaTemplateService: vi.fn(),
  runMmaRenderService: vi.fn(),
}));

vi.mock('../lib/music-services/mma-service', () => ({
  runMmaTemplateService: mocked.runMmaTemplateService,
  runMmaRenderService: mocked.runMmaRenderService,
}));

import { MusicServiceError } from '../lib/music-services/errors';
import { POST as templatePost } from '../app/api/music/mma/template/route';
import { POST as renderPost } from '../app/api/music/mma/render/route';

describe('POST /api/music/mma/template route', () => {
  it('returns service payload and status on success', async () => {
    mocked.runMmaTemplateService.mockResolvedValue({
      status: 200,
      body: { template: 'Tempo 100' },
    });

    const response = await templatePost(new Request('http://localhost/api/music/mma/template', {
      method: 'POST',
      body: JSON.stringify({ content: '<score-partwise />' }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ template: 'Tempo 100' });
  });

  it('maps MusicServiceError to status and error payload', async () => {
    mocked.runMmaTemplateService.mockRejectedValue(new MusicServiceError('bad input', 422));

    const response = await templatePost(new Request('http://localhost/api/music/mma/template', {
      method: 'POST',
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: 'bad input' });
  });
});

describe('POST /api/music/mma/render route', () => {
  it('returns service payload and status on success', async () => {
    mocked.runMmaRenderService.mockResolvedValue({
      status: 200,
      body: { ok: true, midiBase64: 'TVRoZA==' },
    });

    const response = await renderPost(new Request('http://localhost/api/music/mma/render', {
      method: 'POST',
      body: JSON.stringify({ script: 'Tempo 100' }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, midiBase64: 'TVRoZA==' });
  });

  it('maps MusicServiceError to status and error payload', async () => {
    mocked.runMmaRenderService.mockRejectedValue(new MusicServiceError('bad input', 422));

    const response = await renderPost(new Request('http://localhost/api/music/mma/render', {
      method: 'POST',
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: 'bad input' });
  });

  it('maps generic timeout failures to 408', async () => {
    mocked.runMmaRenderService.mockRejectedValue(new Error('MMA command timed out after 60000ms.'));

    const response = await renderPost(new Request('http://localhost/api/music/mma/render', {
      method: 'POST',
      body: JSON.stringify({ script: 'Tempo 100' }),
    }));

    expect(response.status).toBe(408);
    await expect(response.json()).resolves.toMatchObject({ error: 'MMA command timed out after 60000ms.' });
  });
});
