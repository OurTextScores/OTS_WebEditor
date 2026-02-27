import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  convertMusicNotation: vi.fn(),
  ensureMusicConversionToolsAvailable: vi.fn(),
  normalizeMusicFormat: vi.fn(),
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
}));

vi.mock('../lib/score-artifacts', () => ({
  createScoreArtifact: mocked.createScoreArtifact,
  getScoreArtifact: mocked.getScoreArtifact,
  summarizeScoreArtifact: mocked.summarizeScoreArtifact,
}));

import { MusicServiceError } from '../lib/music-services/errors';
import { runMusicConvertService } from '../lib/music-services/convert-service';

describe('runMusicConvertService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.normalizeMusicFormat.mockImplementation((value: unknown) => {
      if (typeof value !== 'string') return null;
      const normalized = value.trim().toLowerCase();
      if (normalized === 'abc') return 'abc';
      if (normalized === 'musicxml' || normalized === 'xml') return 'musicxml';
      return null;
    });
  });

  it('returns health status payload when health check is requested', async () => {
    mocked.ensureMusicConversionToolsAvailable.mockResolvedValue({
      ok: true,
      config: {
        xml2abcScript: '/opt/notagen/xml2abc.py',
        abc2xmlScript: '/opt/notagen/abc2xml.py',
        pythonCommand: 'python3',
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
      pythonCommand: 'python3',
    });
    expect(mocked.convertMusicNotation).not.toHaveBeenCalled();
  });

  it('throws a 400 error when output format is missing or invalid', async () => {
    await expect(
      runMusicConvertService({
        inputFormat: 'musicxml',
        content: '<score-partwise />',
      }),
    ).rejects.toMatchObject<Partial<MusicServiceError>>({
      status: 400,
    });
  });

  it('throws a 404 error when input artifact id cannot be resolved', async () => {
    mocked.getScoreArtifact.mockResolvedValue(null);

    await expect(
      runMusicConvertService({
        inputArtifactId: 'missing-artifact',
        outputFormat: 'abc',
      }),
    ).rejects.toMatchObject<Partial<MusicServiceError>>({
      status: 404,
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
    });
  });

  it('uses source artifact content and format when inputArtifactId is provided', async () => {
    mocked.getScoreArtifact.mockResolvedValue({
      id: 'source-1',
      format: 'abc',
      content: 'X:1\nM:4/4\nK:C\nCDEF|',
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
});
