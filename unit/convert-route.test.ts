import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  runMusicConvertService: vi.fn(),
}));

vi.mock('../lib/music-services/convert-service', () => ({
  runMusicConvertService: mocked.runMusicConvertService,
}));

import { MusicServiceError } from '../lib/music-services/errors';
import { POST } from '../app/api/music/convert/route';
import { POST as postKernToMusicXml } from '../app/api/music/kern/to-musicxml/route';
import { POST as postMusicXmlToKern } from '../app/api/music/musicxml/to-kern/route';

describe('POST /api/music/convert route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns service payload and status on success', async () => {
    mocked.runMusicConvertService.mockResolvedValue({
      status: 201,
      body: { ok: true, outputArtifactId: 'out-1' },
    });

    const response = await POST(
      new Request('http://localhost/api/music/convert', {
        method: 'POST',
        body: JSON.stringify({ inputFormat: 'musicxml', outputFormat: 'abc' }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ ok: true, outputArtifactId: 'out-1' });
    expect(mocked.runMusicConvertService).toHaveBeenCalledTimes(1);
  });

  it('maps MusicServiceError to status and error payload', async () => {
    mocked.runMusicConvertService.mockRejectedValue(new MusicServiceError('bad input', 422));

    const response = await POST(
      new Request('http://localhost/api/music/convert', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: 'bad input' });
  });

  it('maps generic tools-unavailable errors to 503', async () => {
    mocked.runMusicConvertService.mockRejectedValue(new Error('Tools unavailable in this runtime'));

    const response = await POST(
      new Request('http://localhost/api/music/convert', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Tools unavailable in this runtime',
    });
  });

  it('forces formats for the kern to MusicXML route', async () => {
    mocked.runMusicConvertService.mockResolvedValue({
      status: 200,
      body: { ok: true, outputArtifactId: 'xml-out' },
    });

    const response = await postKernToMusicXml(
      new Request('http://localhost/api/music/kern/to-musicxml', {
        method: 'POST',
        body: JSON.stringify({ outputFormat: 'abc', content: '**kern\n4c\n*-\n' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocked.runMusicConvertService).toHaveBeenCalledWith(
      expect.objectContaining({
        inputFormat: 'kern',
        outputFormat: 'musicxml',
        content: '**kern\n4c\n*-\n',
      }),
      expect.any(Object),
    );
  });

  it('forces formats for the MusicXML to kern route', async () => {
    mocked.runMusicConvertService.mockResolvedValue({
      status: 200,
      body: { ok: true, outputArtifactId: 'kern-out' },
    });

    const response = await postMusicXmlToKern(
      new Request('http://localhost/api/music/musicxml/to-kern', {
        method: 'POST',
        body: JSON.stringify({
          inputFormat: 'abc',
          content: '<score-partwise version="3.1"></score-partwise>',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocked.runMusicConvertService).toHaveBeenCalledWith(
      expect.objectContaining({
        inputFormat: 'musicxml',
        outputFormat: 'kern',
        content: '<score-partwise version="3.1"></score-partwise>',
      }),
      expect.any(Object),
    );
  });
});
