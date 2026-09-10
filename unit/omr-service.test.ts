import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  convertMusicNotation: vi.fn(),
  createScoreArtifact: vi.fn(),
  summarizeScoreArtifact: vi.fn((artifact: { id: string; format: string }) => ({
    id: artifact.id,
    format: artifact.format,
  })),
  predict: vi.fn(),
  close: vi.fn(),
  connect: vi.fn(),
}));

vi.mock('../lib/music-conversion', () => ({
  convertMusicNotation: mocked.convertMusicNotation,
}));

vi.mock('../lib/score-artifacts', () => ({
  createScoreArtifact: mocked.createScoreArtifact,
  summarizeScoreArtifact: mocked.summarizeScoreArtifact,
}));

vi.mock('@gradio/client', () => ({
  Client: {
    connect: mocked.connect,
  },
}));

import { runMusicOmrTranscribeService } from '../lib/music-services/omr-service';

describe('runMusicOmrTranscribeService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocked.connect.mockResolvedValue({
      predict: mocked.predict,
      close: mocked.close,
    });
    mocked.predict.mockResolvedValue({
      data: ['**kern\n*M4/4\n=1\n4c\n*-\n', '{"device":"cpu"}'],
    });
    mocked.convertMusicNotation.mockResolvedValue({
      inputFormat: 'kern',
      outputFormat: 'musicxml',
      content: '<score-partwise version="3.1"></score-partwise>\n',
      contentEncoding: 'utf8',
      normalization: { schemaVersion: 'music-normalization@1', format: 'musicxml', actions: [] },
      validation: { schemaVersion: 'music-validation@1', summary: { error: 0 }, checks: [] },
      provenance: { engine: 'notagen', durationMs: 1 },
    });
    mocked.createScoreArtifact
      .mockResolvedValueOnce({
        id: 'image-1',
        format: 'png',
        content: 'iVBORw0KGgo=',
        encoding: 'base64',
      })
      .mockResolvedValueOnce({ id: 'kern-1', format: 'kern', content: '**kern\n4c\n*-\n' })
      .mockResolvedValueOnce({
        id: 'xml-1',
        format: 'musicxml',
        content: '<score-partwise version="3.1"></score-partwise>',
      });
  });

  it('transcribes a PNG through Transcoda and converts kern to MusicXML', async () => {
    const result = await runMusicOmrTranscribeService({
      imageBase64: Buffer.from('png-bytes').toString('base64'),
      pageNumber: 2,
      spaceId: 'jhlusko/transcoda',
      includeContent: true,
    });

    expect(result.status).toBe(200);
    expect(mocked.connect).toHaveBeenCalledWith(
      'jhlusko/transcoda',
      expect.objectContaining({ events: ['data', 'status', 'log'] }),
    );
    expect(mocked.predict).toHaveBeenCalledWith('/transcribe', [
      expect.any(Blob),
      'greedy',
      2048,
      3,
      1.1,
    ]);
    expect(mocked.convertMusicNotation).toHaveBeenCalledWith(
      expect.objectContaining({
        inputFormat: 'kern',
        outputFormat: 'musicxml',
        content: '**kern\n*M4/4\n=1\n4c\n*-',
      }),
    );
    expect(result.body).toMatchObject({
      ok: true,
      inputArtifactId: 'image-1',
      kernArtifactId: 'kern-1',
      musicXmlArtifactId: 'xml-1',
      content: {
        kern: '**kern\n*M4/4\n=1\n4c\n*-',
        musicxml: '<score-partwise version="3.1"></score-partwise>\n',
      },
    });
  });

  it('rejects missing image payloads', async () => {
    const result = await runMusicOmrTranscribeService({});

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      ok: false,
      error: 'Missing imageBase64 or imageDataUrl.',
    });
    expect(mocked.connect).not.toHaveBeenCalled();
  });

  it('serves repeated Transcoda requests from the in-process cache', async () => {
    mocked.createScoreArtifact.mockReset();
    mocked.createScoreArtifact
      .mockResolvedValueOnce({
        id: 'image-cache',
        format: 'png',
        content: 'iVBORw0KGgo=',
        encoding: 'base64',
      })
      .mockResolvedValueOnce({ id: 'kern-cache', format: 'kern', content: '**kern\n4c\n*-\n' })
      .mockResolvedValueOnce({
        id: 'xml-cache',
        format: 'musicxml',
        content: '<score-partwise version="3.1"></score-partwise>',
      });

    const request = {
      imageBase64: Buffer.from('cache-png-bytes').toString('base64'),
      includeContent: true,
      decoding: 'beam',
      numBeams: 4,
    };

    const first = await runMusicOmrTranscribeService(request);
    const second = await runMusicOmrTranscribeService(request);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mocked.connect).toHaveBeenCalledTimes(1);
    expect(mocked.predict).toHaveBeenCalledTimes(1);
    expect(second.body).toMatchObject({
      inputArtifactId: 'image-cache',
      kernArtifactId: 'kern-cache',
      musicXmlArtifactId: 'xml-cache',
      cache: {
        hit: true,
      },
    });
  });

  it('returns kern output when Transcoda kern cannot be converted to MusicXML', async () => {
    mocked.createScoreArtifact.mockReset();
    mocked.createScoreArtifact
      .mockResolvedValueOnce({
        id: 'image-1',
        format: 'png',
        content: 'iVBORw0KGgo=',
        encoding: 'base64',
      })
      .mockResolvedValueOnce({ id: 'kern-1', format: 'kern', content: '**kern\ninvalid\n*-\n' });
    mocked.convertMusicNotation.mockRejectedValueOnce(
      new Error('kern-to-musicxml failed: Could not determine spineType for spine with id 0'),
    );

    const result = await runMusicOmrTranscribeService({
      imageBase64: Buffer.from('png-bytes').toString('base64'),
      includeContent: true,
    });

    expect(result.status).toBe(200);
    expect(mocked.createScoreArtifact).toHaveBeenCalledTimes(2);
    expect(result.body).toMatchObject({
      ok: true,
      musicXmlArtifactId: null,
      conversion: null,
      conversionError: {
        message: 'kern-to-musicxml failed: Could not determine spineType for spine with id 0',
      },
      content: {
        kern: '**kern\n*M4/4\n=1\n4c\n*-',
        musicxml: '',
      },
    });
    expect(result.body.warnings).toEqual([
      'Transcoda returned kern text, but the OTS API could not convert it to MusicXML.',
    ]);
  });
});
