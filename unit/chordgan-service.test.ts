import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  convertMusicNotation: vi.fn(),
  createScoreArtifact: vi.fn(),
  getScoreArtifact: vi.fn(),
  summarizeScoreArtifact: vi.fn((artifact: { id: string; format: string }) => ({
    id: artifact.id,
    format: artifact.format,
  })),
  gradioConnect: vi.fn(),
}));

vi.mock('../lib/music-conversion', () => ({
  convertMusicNotation: mocked.convertMusicNotation,
}));

vi.mock('../lib/score-artifacts', () => ({
  createScoreArtifact: mocked.createScoreArtifact,
  getScoreArtifact: mocked.getScoreArtifact,
  summarizeScoreArtifact: mocked.summarizeScoreArtifact,
}));

vi.mock('@gradio/client', () => ({
  Client: {
    connect: mocked.gradioConnect,
  },
}));

import {
  runChordGanOptionsService,
  runChordGanTransferService,
  runChordGanTransferStreamService,
} from '../lib/music-services/chordgan-service';

describe('chordgan services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns static options when dynamic probing is disabled', async () => {
    const result = await runChordGanOptionsService({
      backend: 'huggingface-space',
      preferDynamic: false,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ok: true,
      specialist: 'chordgan',
      backend: 'huggingface-space',
    });
    expect(Array.isArray((result.body.options as { styles?: unknown[] })?.styles)).toBe(true);
    expect(mocked.gradioConnect).not.toHaveBeenCalled();
  });

  it('rejects transfer requests without a style', async () => {
    const result = await runChordGanTransferService({
      backend: 'huggingface-space',
      content: '<score-partwise version="3.1"></score-partwise>',
      inputFormat: 'musicxml',
      dryRun: true,
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      ok: false,
      error: {
        code: 'invalid_request',
        message: 'Missing style for ChordGAN transfer.',
      },
    });
  });

  it('returns dry-run request payload when transfer request is valid', async () => {
    const result = await runChordGanTransferService({
      backend: 'huggingface-space',
      style: 'classical',
      content: '<score-partwise version="3.1"></score-partwise>',
      inputFormat: 'musicxml',
      includeMidi: true,
      includeMusicXml: true,
      dryRun: true,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ready: true,
      specialist: 'chordgan',
      backend: 'huggingface-space',
      phase: 'phase0',
      dryRun: true,
      generation: null,
    });
    expect((result.body.request as { style?: string })?.style).toBe('classical');
  });

  it('executes non-dry-run transfer and returns midi + musicxml outputs', async () => {
    mocked.convertMusicNotation
      .mockResolvedValueOnce({
        inputFormat: 'musicxml',
        outputFormat: 'midi',
        content: 'TVRoZAAAAAYAAQABAGBNVHJrAAAAAA==',
        contentEncoding: 'base64',
        normalization: { schemaVersion: 'music-normalization@1', format: 'midi', actions: [] },
        validation: { schemaVersion: 'music-validation@1', summary: { warning: 0, error: 0 } },
        provenance: { engine: 'notagen', durationMs: 10 },
      })
      .mockResolvedValueOnce({
        inputFormat: 'midi',
        outputFormat: 'midi',
        content: 'TVRoZBBBBAYAAQABAGBNVHJrAAAAAA==',
        contentEncoding: 'base64',
        normalization: { schemaVersion: 'music-normalization@1', format: 'midi', actions: [] },
        validation: { schemaVersion: 'music-validation@1', summary: { warning: 1, error: 0 } },
        provenance: { engine: 'notagen', durationMs: 10 },
      })
      .mockResolvedValueOnce({
        inputFormat: 'midi',
        outputFormat: 'musicxml',
        content: '<score-partwise version="3.1"></score-partwise>',
        contentEncoding: 'utf8',
        normalization: { schemaVersion: 'music-normalization@1', format: 'musicxml', actions: [] },
        validation: { schemaVersion: 'music-validation@1', summary: { warning: 2, error: 0 } },
        provenance: { engine: 'notagen', durationMs: 20 },
      });

    mocked.createScoreArtifact
      .mockResolvedValueOnce({
        id: 'mid-1',
        format: 'midi',
        content: 'TVRoZBBBBAYAAQABAGBNVHJrAAAAAA==',
      })
      .mockResolvedValueOnce({
        id: 'xml-1',
        format: 'musicxml',
        content: '<score-partwise version="3.1"></score-partwise>',
      });

    mocked.gradioConnect.mockResolvedValue({
      predict: vi.fn().mockResolvedValue({
        data: {
          midiBase64: 'TVRoZBBBBAYAAQABAGBNVHJrAAAAAA==',
        },
      }),
      close: vi.fn(),
    });

    const result = await runChordGanTransferService({
      backend: 'huggingface-space',
      style: 'jazz',
      content: '<score-partwise version="3.1"></score-partwise>',
      inputFormat: 'musicxml',
      includeMidi: true,
      includeMusicXml: true,
      dryRun: false,
      includeContent: true,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ready: true,
      specialist: 'chordgan',
      phase: 'phase1',
      dryRun: false,
      generatedMidiArtifactId: 'mid-1',
      outputArtifactId: 'xml-1',
      midiBase64: 'TVRoZBBBBAYAAQABAGBNVHJrAAAAAA==',
      musicxml: '<score-partwise version="3.1"></score-partwise>',
    });
    expect(mocked.convertMusicNotation).toHaveBeenCalledTimes(3);
    expect(mocked.createScoreArtifact).toHaveBeenCalledTimes(2);
    expect(mocked.gradioConnect).toHaveBeenCalledTimes(1);
  });

  it('returns stream events for valid dry-run requests', async () => {
    const result = await runChordGanTransferStreamService({
      backend: 'huggingface-space',
      style: 'pop',
      content: '<score-partwise version="3.1"></score-partwise>',
      inputFormat: 'musicxml',
      dryRun: true,
    });

    expect(result.status).toBe(200);
    expect(Array.isArray(result.events)).toBe(true);
    expect(result.events?.map((event) => event.event)).toEqual(['ready', 'status', 'result']);
  });
});

