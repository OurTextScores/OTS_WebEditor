import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  convertMusicNotation: vi.fn(),
  createScoreArtifact: vi.fn(),
  getScoreArtifact: vi.fn(),
  summarizeScoreArtifact: vi.fn((artifact: { id: string; format: string }) => ({
    id: artifact.id,
    format: artifact.format,
  })),
}));

vi.mock('../lib/music-conversion', () => ({
  convertMusicNotation: mocked.convertMusicNotation,
}));

vi.mock('../lib/score-artifacts', () => ({
  createScoreArtifact: mocked.createScoreArtifact,
  getScoreArtifact: mocked.getScoreArtifact,
  summarizeScoreArtifact: mocked.summarizeScoreArtifact,
}));

import { runMusicGenerateService } from '../lib/music-services/generate-service';

type GenerateDryRunBody = {
  message?: string;
  generationPrompt?: {
    preview?: string;
  };
  request?: {
    spaceId?: string;
  };
};

describe('runMusicGenerateService (dry-run and validation guards)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when huggingface backend is missing hfToken', async () => {
    const result = await runMusicGenerateService({
      backend: 'huggingface',
      modelId: 'ElectricAlexis/NotaGen',
      dryRun: true,
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: 'Missing hfToken (BYO Hugging Face token).',
    });
  });

  it('returns 400 for unsupported backends', async () => {
    const result = await runMusicGenerateService({
      backend: 'unknown-provider',
      dryRun: true,
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: 'Unsupported NotaGen backend: unknown-provider.',
    });
  });

  it('returns dry-run payload for huggingface backend without external inference call', async () => {
    const result = await runMusicGenerateService({
      backend: 'huggingface',
      hfToken: 'hf_exampletoken',
      modelId: 'ElectricAlexis/NotaGen',
      prompt: 'Compose a short piece in C major.',
      includePrompt: true,
      dryRun: true,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      specialist: 'notagen',
      backend: 'huggingface',
      generation: null,
    });
    const body = result.body as GenerateDryRunBody;
    expect(String(body.message || '')).toContain('Set dryRun=false');
    expect(String(body.generationPrompt?.preview || '')).toContain(
      'Generate a single musical score in valid ABC notation.',
    );
  });

  it('returns dry-run payload for huggingface-space backend', async () => {
    const result = await runMusicGenerateService({
      backend: 'huggingface-space',
      spaceId: 'jhlusko/NotaGen-Space',
      period: 'Classical',
      composer: 'Mozart, Wolfgang Amadeus',
      instrumentation: 'Keyboard',
      dryRun: true,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      specialist: 'notagen',
      backend: 'huggingface-space',
      generation: null,
    });
    const body = result.body as GenerateDryRunBody;
    expect(body.request?.spaceId).toBe('jhlusko/NotaGen-Space');
  });

  it('returns 400 when space backend is used with seed artifact', async () => {
    const result = await runMusicGenerateService({
      backend: 'huggingface-space',
      spaceId: 'jhlusko/NotaGen-Space',
      period: 'Classical',
      composer: 'Mozart, Wolfgang Amadeus',
      instrumentation: 'Keyboard',
      inputArtifactId: 'seed-1',
      dryRun: true,
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: 'NotaGen Space backend does not support seed artifacts (inputArtifactId) yet.',
    });
  });

  it('returns 404 when seed artifact id does not exist', async () => {
    mocked.getScoreArtifact.mockResolvedValue(null);

    const result = await runMusicGenerateService({
      backend: 'huggingface',
      hfToken: 'hf_exampletoken',
      modelId: 'ElectricAlexis/NotaGen',
      inputArtifactId: 'missing-seed',
      dryRun: true,
    });

    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({
      error: 'Seed/input artifact not found.',
    });
  });
});
