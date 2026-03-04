import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  convertMusicNotation: vi.fn(),
  ensureMusicConversionToolsAvailable: vi.fn(),
  normalizeMusicFormat: vi.fn(),
  runMusicConversionHealthProbe: vi.fn(),
  createScoreArtifact: vi.fn(),
  getScoreArtifact: vi.fn(),
  summarizeScoreArtifact: vi.fn((artifact: { id: string; format: string }) => ({
    id: artifact.id,
    format: artifact.format,
  })),
}));

vi.mock('../lib/music-conversion', () => ({
  convertMusicNotation: mocked.convertMusicNotation,
  ensureMusicConversionToolsAvailable: mocked.ensureMusicConversionToolsAvailable,
  normalizeMusicFormat: mocked.normalizeMusicFormat,
  runMusicConversionHealthProbe: mocked.runMusicConversionHealthProbe,
}));

vi.mock('../lib/score-artifacts', () => ({
  createScoreArtifact: mocked.createScoreArtifact,
  getScoreArtifact: mocked.getScoreArtifact,
  summarizeScoreArtifact: mocked.summarizeScoreArtifact,
}));

import {
  __resetMusicConvertServiceHealthProbeCacheForTests,
  runMusicConvertService,
} from '../lib/music-services/convert-service';

describe('runMusicConvertService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetMusicConvertServiceHealthProbeCacheForTests();
    mocked.normalizeMusicFormat.mockImplementation((value: unknown) => {
      if (typeof value !== 'string') return null;
      const normalized = value.trim().toLowerCase();
      if (normalized === 'abc') return 'abc';
      if (normalized === 'musicxml' || normalized === 'xml') return 'musicxml';
      if (normalized === 'midi' || normalized === 'mid') return 'midi';
      return null;
    });
    mocked.runMusicConversionHealthProbe.mockResolvedValue({
      ok: true,
      inputFormat: 'musicxml',
      outputFormat: 'midi',
      timeoutMs: 60000,
      durationMs: 42,
    });
  });

  it('returns health status payload when health check is requested', async () => {
    mocked.ensureMusicConversionToolsAvailable.mockResolvedValue({
      ok: true,
      config: {
        xml2abcScript: '/opt/notagen/xml2abc.py',
        abc2xmlScript: '/opt/notagen/abc2xml.py',
        pythonCommand: 'python3',
        musescoreTimeoutMs: 60000,
        musescoreBins: ['musescore3'],
      },
      missing: [],
    });

    const result = await runMusicConvertService({ healthCheck: true });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ok: true,
      engine: 'notagen',
      scripts: {
        xml2abc: '/opt/notagen/xml2abc.py',
        abc2xml: '/opt/notagen/abc2xml.py',
      },
      midi: {
        engine: 'musescore',
        candidates: ['musescore3'],
      },
      pythonCommand: 'python3',
    });
    expect(mocked.convertMusicNotation).not.toHaveBeenCalled();
    expect(mocked.runMusicConversionHealthProbe).toHaveBeenCalledTimes(1);
  });

  it('returns 503 when tools are available but conversion probe fails', async () => {
    mocked.ensureMusicConversionToolsAvailable.mockResolvedValue({
      ok: true,
      config: {
        xml2abcScript: '/opt/notagen/xml2abc.py',
        abc2xmlScript: '/opt/notagen/abc2xml.py',
        pythonCommand: 'python3',
        musescoreTimeoutMs: 60000,
        musescoreBins: ['musescore3'],
      },
      missing: [],
    });
    mocked.runMusicConversionHealthProbe.mockResolvedValue({
      ok: false,
      inputFormat: 'musicxml',
      outputFormat: 'midi',
      timeoutMs: 60000,
      durationMs: 100,
      error: 'probe failed',
    });

    const result = await runMusicConvertService({ healthCheck: true });

    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({
      ok: false,
      probe: {
        ok: false,
        error: 'probe failed',
      },
    });
  });

  it('reuses cached health probe result within TTL', async () => {
    const previousTtl = process.env.MUSIC_CONVERT_HEALTH_PROBE_TTL_MS;
    try {
      process.env.MUSIC_CONVERT_HEALTH_PROBE_TTL_MS = '30000';
      mocked.ensureMusicConversionToolsAvailable.mockResolvedValue({
        ok: true,
        config: {
          xml2abcScript: '/opt/notagen/xml2abc.py',
          abc2xmlScript: '/opt/notagen/abc2xml.py',
          pythonCommand: 'python3',
          musescoreTimeoutMs: 60000,
          musescoreBins: ['musescore3'],
        },
        missing: [],
      });
      mocked.runMusicConversionHealthProbe.mockResolvedValue({
        ok: true,
        inputFormat: 'musicxml',
        outputFormat: 'midi',
        timeoutMs: 60000,
        durationMs: 77,
      });

      const first = await runMusicConvertService({ healthCheck: true });
      const second = await runMusicConvertService({ healthCheck: true });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(first.body).toMatchObject({
        probeCache: {
          enabled: true,
          ttlMs: 30000,
          fromCache: false,
        },
      });
      expect(second.body).toMatchObject({
        probeCache: {
          enabled: true,
          ttlMs: 30000,
          fromCache: true,
        },
      });
      expect(mocked.runMusicConversionHealthProbe).toHaveBeenCalledTimes(1);
    } finally {
      if (previousTtl === undefined) {
        delete process.env.MUSIC_CONVERT_HEALTH_PROBE_TTL_MS;
      } else {
        process.env.MUSIC_CONVERT_HEALTH_PROBE_TTL_MS = previousTtl;
      }
    }
  });

  it('returns 400 when output format is missing or invalid', async () => {
    const result = await runMusicConvertService({
      inputFormat: 'musicxml',
      content: '<score-partwise />',
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: 'Missing or invalid output format. Use abc, musicxml, or midi.',
    });
  });

  it('returns 404 when input artifact id cannot be resolved', async () => {
    mocked.getScoreArtifact.mockResolvedValue(null);

    const result = await runMusicConvertService({
      inputArtifactId: 'missing-artifact',
      outputFormat: 'abc',
    });

    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({
      ok: false,
      error: {
        code: 'target_not_found',
      },
    });
  });

  it('converts content and returns summarized input/output artifacts', async () => {
    mocked.createScoreArtifact
      .mockResolvedValueOnce({
        id: 'input-1',
        format: 'musicxml',
        content: '<score-partwise version="3.1"></score-partwise>',
      })
      .mockResolvedValueOnce({
        id: 'output-1',
        format: 'abc',
        content: 'X:1\nT:Converted\nM:4/4\nK:C\nC D E F|',
      });

    mocked.convertMusicNotation.mockResolvedValue({
      inputFormat: 'musicxml',
      outputFormat: 'abc',
      content: 'X:1\nT:Converted\nM:4/4\nK:C\nC D E F|',
      contentEncoding: 'utf8',
      normalization: { schemaVersion: 'music-normalization@1', format: 'abc', actions: [] },
      validation: { schemaVersion: 'music-validation@1', summary: { error: 0 } },
      provenance: { tool: 'convertMusicNotation' },
    });

    const result = await runMusicConvertService({
      inputFormat: 'musicxml',
      outputFormat: 'abc',
      content: '<score-partwise version="3.1"></score-partwise>',
      includeContent: true,
    });

    expect(mocked.convertMusicNotation).toHaveBeenCalledWith(
      expect.objectContaining({
        inputFormat: 'musicxml',
        outputFormat: 'abc',
        contentEncoding: 'utf8',
      }),
    );
    expect(mocked.createScoreArtifact).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      inputArtifactId: 'input-1',
      outputArtifactId: 'output-1',
      inputArtifact: { id: 'input-1', format: 'musicxml' },
      outputArtifact: { id: 'output-1', format: 'abc' },
      content: 'X:1\nT:Converted\nM:4/4\nK:C\nC D E F|',
      contentEncoding: 'utf8',
    });
  });

  it('uses source artifact content and format when inputArtifactId is provided', async () => {
    mocked.getScoreArtifact.mockResolvedValue({
      id: 'source-1',
      format: 'abc',
      content: 'X:1\nM:4/4\nK:C\nCDEF|',
      encoding: 'utf8',
    });
    mocked.createScoreArtifact.mockResolvedValue({
      id: 'output-2',
      format: 'musicxml',
      content: '<score-partwise version="3.1"></score-partwise>',
    });
    mocked.convertMusicNotation.mockResolvedValue({
      inputFormat: 'abc',
      outputFormat: 'musicxml',
      content: '<score-partwise version="3.1"></score-partwise>',
      contentEncoding: 'utf8',
      normalization: { schemaVersion: 'music-normalization@1', format: 'musicxml', actions: [] },
      validation: { schemaVersion: 'music-validation@1', summary: { error: 0 } },
      provenance: { tool: 'convertMusicNotation' },
    });

    const result = await runMusicConvertService({
      inputArtifactId: 'source-1',
      outputFormat: 'musicxml',
    });

    expect(mocked.createScoreArtifact).toHaveBeenCalledTimes(1);
    expect(mocked.convertMusicNotation).toHaveBeenCalledWith(
      expect.objectContaining({
        inputFormat: 'abc',
        content: 'X:1\nM:4/4\nK:C\nCDEF|',
      }),
    );
    expect(result.body).toMatchObject({
      inputArtifactId: 'source-1',
      outputArtifactId: 'output-2',
    });
  });

  it('accepts base64 MIDI payloads and preserves encoding metadata', async () => {
    const midiBase64 = Buffer.from('MThd-mock-midi').toString('base64');
    mocked.createScoreArtifact
      .mockResolvedValueOnce({
        id: 'input-midi',
        format: 'midi',
        content: midiBase64,
        encoding: 'base64',
      })
      .mockResolvedValueOnce({
        id: 'output-xml',
        format: 'musicxml',
        content: '<score-partwise version="3.1"></score-partwise>',
        encoding: 'utf8',
      });
    mocked.convertMusicNotation.mockResolvedValue({
      inputFormat: 'midi',
      outputFormat: 'musicxml',
      content: '<score-partwise version="3.1"></score-partwise>',
      contentEncoding: 'utf8',
      normalization: { schemaVersion: 'music-normalization@1', format: 'musicxml', actions: [] },
      validation: { schemaVersion: 'music-validation@1', summary: { error: 0 } },
      provenance: { tool: 'convertMusicNotation' },
    });

    const result = await runMusicConvertService({
      inputFormat: 'midi',
      outputFormat: 'musicxml',
      content_base64: midiBase64,
      includeContent: true,
    });

    expect(result.status).toBe(200);
    expect(mocked.convertMusicNotation).toHaveBeenCalledWith(
      expect.objectContaining({
        inputFormat: 'midi',
        contentEncoding: 'base64',
        content: midiBase64,
      }),
    );
    expect(result.body).toMatchObject({
      contentEncoding: 'utf8',
    });
  });

  it('returns 400 for base64 payload when input format cannot be inferred', async () => {
    const notMidiBase64 = Buffer.from('not-a-midi-header').toString('base64');

    const result = await runMusicConvertService({
      outputFormat: 'musicxml',
      content_base64: notMidiBase64,
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: 'Could not infer format from base64 payload. Provide inputFormat (midi).',
    });
  });

  it('returns 400 when non-midi input format is paired with base64 payload', async () => {
    const midiBase64 = Buffer.from('MThd-mock-midi').toString('base64');

    const result = await runMusicConvertService({
      inputFormat: 'musicxml',
      outputFormat: 'abc',
      content_base64: midiBase64,
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: 'Base64 input is currently supported for MIDI only. Set inputFormat to midi.',
    });
  });

  it('returns 400 when inputFormat is midi but base64 payload is not MIDI', async () => {
    const notMidiBase64 = Buffer.from('not-a-midi-header').toString('base64');

    const result = await runMusicConvertService({
      inputFormat: 'midi',
      outputFormat: 'musicxml',
      content_base64: notMidiBase64,
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: 'Base64 payload does not appear to be MIDI (MThd header missing).',
    });
  });
});
