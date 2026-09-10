import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  runMusicGenerateService: vi.fn(),
  runMusicOmrTranscribeService: vi.fn(),
}));

vi.mock('../lib/music-services/generate-service', () => ({
  runMusicGenerateService: mocked.runMusicGenerateService,
}));
vi.mock('../lib/music-services/omr-service', () => ({
  runMusicOmrTranscribeService: mocked.runMusicOmrTranscribeService,
}));

import { POST as generatePost } from '../app/api/music/generate/route';
import { POST as omrPost } from '../app/api/music/omr/transcribe/route';

const ENV_KEYS = [
  'ALLOW_SERVER_LLM_KEYS',
  'OTS_API_AUTH_TOKEN',
  'MUSIC_API_AUTH_TOKEN',
  'API_AUTH_TOKEN',
  'MUSIC_NOTAGEN_SPACE_TOKEN',
  'MUSIC_TRANSCODA_SPACE_TOKEN',
  'HF_TOKEN',
] as const;

const priorEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ENV_KEYS) {
    priorEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (priorEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = priorEnv[key];
    }
  }
});

const post = (
  handler: (r: Request) => Promise<Response>,
  route: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  handler(
    new Request(`http://localhost${route}`, {
      method: 'POST',
      headers: { 'x-forwarded-for': '10.1.0.1', ...headers },
      body: JSON.stringify(body),
    }),
  );

describe('server-credential gating: /api/music/generate (NotaGen space)', () => {
  it('gates the space backend when a server space token is configured and no request token is supplied', async () => {
    process.env.MUSIC_NOTAGEN_SPACE_TOKEN = 'hf-server-token';
    const response = await post(generatePost, '/api/music/generate', {
      backend: 'huggingface-space',
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'server_credentials_disabled' });
    expect(mocked.runMusicGenerateService).not.toHaveBeenCalled();
  });

  it('does not gate when the caller supplies their own hfToken', async () => {
    process.env.MUSIC_NOTAGEN_SPACE_TOKEN = 'hf-server-token';
    mocked.runMusicGenerateService.mockResolvedValue({ status: 200, body: { ok: true } });
    const response = await post(generatePost, '/api/music/generate', {
      backend: 'huggingface-space',
      hfToken: 'user-supplied',
    });
    expect(response.status).toBe(200);
    expect(mocked.runMusicGenerateService).toHaveBeenCalledTimes(1);
  });

  it('does not gate a non-space backend even when a server space token is set', async () => {
    process.env.MUSIC_NOTAGEN_SPACE_TOKEN = 'hf-server-token';
    mocked.runMusicGenerateService.mockResolvedValue({ status: 200, body: { ok: true } });
    const response = await post(generatePost, '/api/music/generate', { backend: 'huggingface' });
    expect(response.status).toBe(200);
    expect(mocked.runMusicGenerateService).toHaveBeenCalledTimes(1);
  });

  it('does not gate the space backend when no server space token is configured', async () => {
    mocked.runMusicGenerateService.mockResolvedValue({ status: 200, body: { ok: true } });
    const response = await post(generatePost, '/api/music/generate', {
      backend: 'huggingface-space',
    });
    expect(response.status).toBe(200);
    expect(mocked.runMusicGenerateService).toHaveBeenCalledTimes(1);
  });

  it('passes the gate and runs the service when server keys + a valid app token are provided', async () => {
    process.env.MUSIC_NOTAGEN_SPACE_TOKEN = 'hf-server-token';
    process.env.ALLOW_SERVER_LLM_KEYS = '1';
    process.env.OTS_API_AUTH_TOKEN = 'app-token';
    mocked.runMusicGenerateService.mockResolvedValue({ status: 200, body: { ok: true } });
    const response = await post(
      generatePost,
      '/api/music/generate',
      { backend: 'huggingface-space' },
      { 'x-ots-api-token': 'app-token' },
    );
    expect(response.status).toBe(200);
    expect(mocked.runMusicGenerateService).toHaveBeenCalledTimes(1);
  });
});

describe('server-credential gating: /api/music/omr/transcribe', () => {
  it('gates when a server HF/transcoda token is configured and no request token is supplied', async () => {
    process.env.MUSIC_TRANSCODA_SPACE_TOKEN = 'hf-server-token';
    const response = await post(omrPost, '/api/music/omr/transcribe', { imageBase64: 'x' });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'server_credentials_disabled' });
    expect(mocked.runMusicOmrTranscribeService).not.toHaveBeenCalled();
  });

  it('does not gate when the caller supplies their own hfToken', async () => {
    process.env.MUSIC_TRANSCODA_SPACE_TOKEN = 'hf-server-token';
    mocked.runMusicOmrTranscribeService.mockResolvedValue({ status: 200, body: { ok: true } });
    const response = await post(omrPost, '/api/music/omr/transcribe', {
      imageBase64: 'x',
      hfToken: 'user-supplied',
    });
    expect(response.status).toBe(200);
    expect(mocked.runMusicOmrTranscribeService).toHaveBeenCalledTimes(1);
  });

  it('does not gate when no server token is configured', async () => {
    mocked.runMusicOmrTranscribeService.mockResolvedValue({ status: 200, body: { ok: true } });
    const response = await post(omrPost, '/api/music/omr/transcribe', { imageBase64: 'x' });
    expect(response.status).toBe(200);
    expect(mocked.runMusicOmrTranscribeService).toHaveBeenCalledTimes(1);
  });

  it('passes the gate with server keys + a valid app token (via Bearer header)', async () => {
    process.env.HF_TOKEN = 'hf-server-token';
    process.env.ALLOW_SERVER_LLM_KEYS = '1';
    process.env.MUSIC_API_AUTH_TOKEN = 'app-token';
    mocked.runMusicOmrTranscribeService.mockResolvedValue({ status: 200, body: { ok: true } });
    const response = await post(
      omrPost,
      '/api/music/omr/transcribe',
      { imageBase64: 'x' },
      { authorization: 'Bearer app-token' },
    );
    expect(response.status).toBe(200);
    expect(mocked.runMusicOmrTranscribeService).toHaveBeenCalledTimes(1);
  });
});
