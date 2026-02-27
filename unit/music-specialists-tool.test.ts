import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/score-editor-api-client', () => ({
  resolveScoreEditorApiPath: (path: string) => `/proxy${path}`,
}));

import { callMusicContext, callMusicGenerate, MusicSpecialistsTool } from '../lib/music-specialists-tool';

describe('music-specialists-tool client helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls generate endpoint with normalized payload', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);

    const result = await callMusicGenerate({
      hfToken: 'hf_test',
      modelId: 'ElectricAlexis/NotaGen',
      prompt: 'compose',
      dryRun: true,
    });

    expect(result).toMatchObject({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      '/proxy/api/music/generate',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    const callBody = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit)?.body ?? '{}'));
    expect(callBody).toMatchObject({
      backend: 'huggingface',
      hfToken: 'hf_test',
      modelId: 'ElectricAlexis/NotaGen',
      prompt: 'compose',
      dryRun: true,
    });
  });

  it('calls context endpoint and exposes helper via MusicSpecialistsTool', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ strategy: 'musicxml-primary' }),
    } as Response);

    const result = await MusicSpecialistsTool.context({
      inputArtifactId: 'art-1',
      query: ['<step>C</step>'],
      measureStart: 1,
      measureEnd: 4,
    });

    expect(result).toMatchObject({ strategy: 'musicxml-primary' });
    expect(fetchSpy).toHaveBeenCalledWith(
      '/proxy/api/music/context',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('throws API error message when backend responds with error payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: 'Generated ABC failed validation.' }),
    } as Response);

    await expect(
      callMusicContext({
        content: '<score-partwise />',
      }),
    ).rejects.toThrow('Generated ABC failed validation.');
  });

  it('falls back to status-based error when error payload is absent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    await expect(
      callMusicGenerate({
        hfToken: 'hf_x',
        modelId: 'model-x',
      }),
    ).rejects.toThrow('Request failed: 500');
  });
});

