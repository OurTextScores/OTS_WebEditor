import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  convertMusicNotation: vi.fn(),
  createScoreArtifact: vi.fn(),
  summarizeScoreArtifact: vi.fn((artifact: { id: string; format: string }) => ({
    id: artifact.id,
    format: artifact.format,
  })),
  runMultitrackVaeGenerate: vi.fn(),
}));

vi.mock('../lib/music-conversion', () => ({
  convertMusicNotation: mocked.convertMusicNotation,
}));

vi.mock('../lib/score-artifacts', () => ({
  createScoreArtifact: mocked.createScoreArtifact,
  summarizeScoreArtifact: mocked.summarizeScoreArtifact,
}));

// Keep the real MultitrackVaeInputError class but stub the engine call.
vi.mock('../lib/music-services/multitrack-vae-engine', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/music-services/multitrack-vae-engine')>();
  return {
    ...actual,
    runMultitrackVaeGenerate: mocked.runMultitrackVaeGenerate,
  };
});

import { runMusicMultitrackVaeService } from '../lib/music-services/multitrack-vae-service';
import { MultitrackVaeInputError } from '../lib/music-services/multitrack-vae-engine';

describe('runMusicMultitrackVaeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.createScoreArtifact.mockImplementation(
      async (input: { format: string; filename: string }) => ({
        id: `artifact-${input.format}`,
        format: input.format,
        filename: input.filename,
      }),
    );
    mocked.runMultitrackVaeGenerate.mockResolvedValue({
      midiBase64: 'TVRoZAAAAAY=',
      numMeasures: 4,
      checkpoint: 'hier-multiperf_vel_1bar_med_chords',
      warnings: [],
      metadata: { num_measures: 4 },
      endpoint: 'http://localhost:7860/multitrack_vae',
      durationMs: 1234,
    });
    mocked.convertMusicNotation.mockResolvedValue({
      content: '<score-partwise/>',
      contentEncoding: 'utf8',
      inputFormat: 'midi',
      outputFormat: 'musicxml',
      normalization: { actions: [] },
      validation: { ok: true },
    });
  });

  it('rejects an invalid mode with 400', async () => {
    const result = await runMusicMultitrackVaeService({ mode: 'nope' });
    expect(result.status).toBe(400);
    expect(result.body.ok).toBe(false);
    expect(mocked.runMultitrackVaeGenerate).not.toHaveBeenCalled();
  });

  it('rejects reconstruct without input MIDI', async () => {
    const result = await runMusicMultitrackVaeService({ mode: 'reconstruct' });
    expect(result.status).toBe(400);
    expect(String(result.body.error)).toMatch(/inputMidiBase64/);
  });

  it('rejects an out-of-range temperature', async () => {
    const result = await runMusicMultitrackVaeService({ mode: 'sample', temperature: 5 });
    expect(result.status).toBe(400);
  });

  it('generates a chord progression and converts to MusicXML', async () => {
    const result = await runMusicMultitrackVaeService({
      mode: 'chord_progression',
      chords: ['C', 'Am', 'F', 'G'],
      temperature: 0.2,
    });
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.engine).toBe('multitrack-musicvae');
    expect(result.body.mode).toBe('chord_progression');
    expect(result.body.midiArtifactId).toBe('artifact-midi');
    expect(result.body.musicXmlArtifactId).toBe('artifact-musicxml');
    expect(mocked.runMultitrackVaeGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'chord_progression', chords: ['C', 'Am', 'F', 'G'] }),
    );
    expect(mocked.convertMusicNotation).toHaveBeenCalledWith(
      expect.objectContaining({
        inputFormat: 'midi',
        outputFormat: 'musicxml',
        contentEncoding: 'base64',
      }),
    );
  });

  it('accepts comma-separated chords and maps chordProgression alias', async () => {
    const result = await runMusicMultitrackVaeService({
      mode: 'chord_progression',
      chordProgression: 'Dm, F, Am, G',
    });
    expect(result.status).toBe(200);
    expect(mocked.runMultitrackVaeGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ chords: ['Dm', 'F', 'Am', 'G'] }),
    );
  });

  it('skips conversion when convertToMusicXml is false', async () => {
    const result = await runMusicMultitrackVaeService({ mode: 'sample', convertToMusicXml: false });
    expect(result.status).toBe(200);
    expect(result.body.musicXmlArtifactId).toBeNull();
    expect(mocked.convertMusicNotation).not.toHaveBeenCalled();
  });

  it('surfaces engine input errors as 400', async () => {
    mocked.runMultitrackVaeGenerate.mockRejectedValueOnce(
      new MultitrackVaeInputError('Unsupported chord "Xyz".'),
    );
    const result = await runMusicMultitrackVaeService({
      mode: 'chord_progression',
      chords: ['Xyz'],
    });
    expect(result.status).toBe(400);
    expect(String(result.body.error)).toMatch(/Unsupported chord/);
  });

  it('surfaces service/runtime failures as 503', async () => {
    mocked.runMultitrackVaeGenerate.mockRejectedValueOnce(
      new Error('Multitrack MusicVAE service connection failed (http://localhost:7860)'),
    );
    const result = await runMusicMultitrackVaeService({ mode: 'sample' });
    expect(result.status).toBe(503);
  });

  it('reports a conversion failure as a warning but still returns MIDI', async () => {
    mocked.convertMusicNotation.mockRejectedValueOnce(new Error('bad midi'));
    const result = await runMusicMultitrackVaeService({ mode: 'sample' });
    expect(result.status).toBe(200);
    expect(result.body.midiArtifactId).toBe('artifact-midi');
    expect(result.body.musicXmlArtifactId).toBeNull();
    expect(result.body.conversionError).toMatchObject({ message: 'bad midi' });
    expect((result.body.warnings as string[]).length).toBeGreaterThan(0);
  });
});
