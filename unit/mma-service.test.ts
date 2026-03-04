import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  buildStarterTemplateFromXml: vi.fn(),
  runMmaCompile: vi.fn(),
  validateMmaScript: vi.fn(),
  convertMusicNotation: vi.fn(),
  createScoreArtifact: vi.fn(),
  summarizeScoreArtifact: vi.fn((artifact: { id: string; format: string }) => ({
    id: artifact.id,
    format: artifact.format,
  })),
}));

vi.mock('../lib/music-mma', () => ({
  buildStarterTemplateFromXml: mocked.buildStarterTemplateFromXml,
  runMmaCompile: mocked.runMmaCompile,
  validateMmaScript: mocked.validateMmaScript,
}));

vi.mock('../lib/music-conversion', () => ({
  convertMusicNotation: mocked.convertMusicNotation,
}));

vi.mock('../lib/score-artifacts', () => ({
  createScoreArtifact: mocked.createScoreArtifact,
  summarizeScoreArtifact: mocked.summarizeScoreArtifact,
}));

import { runMmaRenderService, runMmaTemplateService } from '../lib/music-services/mma-service';

describe('mma services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns generated MMA template payload', async () => {
    mocked.buildStarterTemplateFromXml.mockReturnValue({
      template: 'Tempo 100\nTimeSig 4 4\nKeySig C\nGroove Swing\n\n1 C | F | G7 | C |\n',
      warnings: ['No harmony symbols found.'],
      analysis: {
        meter: '4/4',
        key: 'C',
        tempo: 100,
        measureCount: 4,
        harmonyMeasureCount: 0,
        harmonyCoverage: 0,
      },
    });

    const result = await runMmaTemplateService({
      content: '<score-partwise version="3.1"></score-partwise>',
      maxMeasures: 4,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      template: expect.stringContaining('TimeSig 4 4'),
      warnings: ['No harmony symbols found.'],
      analysis: {
        meter: '4/4',
      },
    });
    expect(mocked.buildStarterTemplateFromXml).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid script payloads', async () => {
    mocked.validateMmaScript.mockReturnValue({
      ok: false,
      bytes: 0,
      error: 'MMA script is empty.',
    });

    const result = await runMmaRenderService({
      script: '   ',
      includeMidi: true,
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      ok: false,
      error: {
        message: 'MMA script is empty.',
      },
    });
    expect(mocked.runMmaCompile).not.toHaveBeenCalled();
  });

  it('renders MMA and converts to MusicXML with artifact creation', async () => {
    mocked.validateMmaScript.mockReturnValue({
      ok: true,
      bytes: 24,
    });

    mocked.runMmaCompile.mockResolvedValue({
      midiBase64: 'TVRoZAAAAAYAAQABAGBNVHJrAAAAAA==',
      midiBytes: 32,
      command: 'mma',
      args: ['-f', '/tmp/output.mid', '/tmp/input.mma'],
      durationMs: 120,
      stderr: 'warning: demo',
    });

    mocked.convertMusicNotation.mockResolvedValue({
      inputFormat: 'midi',
      outputFormat: 'musicxml',
      content: '<score-partwise version="3.1"></score-partwise>',
      contentEncoding: 'utf8',
      normalization: { schemaVersion: 'music-normalization@1', format: 'musicxml', actions: [] },
      validation: { schemaVersion: 'music-validation@1', summary: { warning: 1, error: 0 } },
      provenance: { engine: 'notagen', durationMs: 200 },
    });

    mocked.createScoreArtifact
      .mockResolvedValueOnce({ id: 'mma-1', format: 'mma', content: 'Tempo 100' })
      .mockResolvedValueOnce({ id: 'mid-1', format: 'midi', content: 'TVRoZA==' })
      .mockResolvedValueOnce({ id: 'xml-1', format: 'musicxml', content: '<score-partwise/>' });

    const result = await runMmaRenderService({
      script: 'Tempo 100\n1 C | F | G7 | C |',
      includeMidi: true,
      includeMusicXml: true,
      persistArtifacts: true,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ok: true,
      midiBase64: 'TVRoZAAAAAYAAQABAGBNVHJrAAAAAA==',
      musicxml: '<score-partwise version="3.1"></score-partwise>',
      warnings: [expect.stringContaining('warning')],
      artifacts: {
        input: { id: 'mma-1', format: 'mma' },
        midi: { id: 'mid-1', format: 'midi' },
        musicxml: { id: 'xml-1', format: 'musicxml' },
      },
    });
    expect(mocked.convertMusicNotation).toHaveBeenCalledWith(expect.objectContaining({
      inputFormat: 'midi',
      outputFormat: 'musicxml',
      contentEncoding: 'base64',
    }));
    expect(mocked.createScoreArtifact).toHaveBeenCalledTimes(3);
  });

  it('maps MMA compile failures to bad_request errors', async () => {
    mocked.validateMmaScript.mockReturnValue({
      ok: true,
      bytes: 10,
    });
    mocked.runMmaCompile.mockRejectedValue(new Error('MMA command timed out after 60000ms.'));

    const result = await runMmaRenderService({
      script: 'Tempo 100',
      includeMidi: true,
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      ok: false,
      error: {
        code: 'bad_request',
        message: 'MMA command timed out after 60000ms.',
      },
    });
  });
});
