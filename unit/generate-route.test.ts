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

import { POST } from '../app/api/music/generate/route';

const postJson = (payload: Record<string, unknown>) => POST(new Request('http://localhost/api/music/generate', {
  method: 'POST',
  body: JSON.stringify(payload),
}));

describe('POST /api/music/generate route (dry-run and validation guards)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when huggingface backend is missing hfToken', async () => {
    const response = await postJson({
      backend: 'huggingface',
      modelId: 'ElectricAlexis/NotaGen',
      dryRun: true,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Missing hfToken (BYO Hugging Face token).',
    });
  });

  it('returns 400 for unsupported backends', async () => {
    const response = await postJson({
      backend: 'unknown-provider',
      dryRun: true,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Unsupported NotaGen backend: unknown-provider.',
    });
  });

  it('returns dry-run payload for huggingface backend without external inference call', async () => {
    const response = await postJson({
      backend: 'huggingface',
      hfToken: 'hf_exampletoken',
      modelId: 'ElectricAlexis/NotaGen',
      prompt: 'Compose a short piece in C major.',
      includePrompt: true,
      dryRun: true,
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.specialist).toBe('notagen');
    expect(json.backend).toBe('huggingface');
    expect(json.message).toContain('Set dryRun=false');
    expect(json.generation).toBeNull();
    expect(json.generationPrompt.preview).toContain('Generate a single musical score in valid ABC notation.');
  });

  it('returns dry-run payload for huggingface-space backend', async () => {
    const response = await postJson({
      backend: 'huggingface-space',
      spaceId: 'jhlusko/NotaGen-Space',
      period: 'Classical',
      composer: 'Mozart, Wolfgang Amadeus',
      instrumentation: 'Keyboard',
      dryRun: true,
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.specialist).toBe('notagen');
    expect(json.backend).toBe('huggingface-space');
    expect(json.request.spaceId).toBe('jhlusko/NotaGen-Space');
    expect(json.generation).toBeNull();
  });

  it('returns 400 when space backend is used with seed artifact', async () => {
    const response = await postJson({
      backend: 'huggingface-space',
      spaceId: 'jhlusko/NotaGen-Space',
      period: 'Classical',
      composer: 'Mozart, Wolfgang Amadeus',
      instrumentation: 'Keyboard',
      inputArtifactId: 'seed-1',
      dryRun: true,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'NotaGen Space backend does not support seed artifacts (inputArtifactId) yet.',
    });
  });

  it('returns 404 when seed artifact id does not exist', async () => {
    mocked.getScoreArtifact.mockResolvedValue(null);

    const response = await postJson({
      backend: 'huggingface',
      hfToken: 'hf_exampletoken',
      modelId: 'ElectricAlexis/NotaGen',
      inputArtifactId: 'missing-seed',
      dryRun: true,
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Seed/input artifact not found.',
    });
  });
});

