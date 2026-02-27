import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  getScoreArtifact: vi.fn(),
  summarizeScoreArtifact: vi.fn((artifact: { id: string; format: string }) => ({
    id: artifact.id,
    format: artifact.format,
  })),
}));

vi.mock('../lib/score-artifacts', () => ({
  getScoreArtifact: mocked.getScoreArtifact,
  summarizeScoreArtifact: mocked.summarizeScoreArtifact,
}));

import { runMusicPatchService } from '../lib/music-services/patch-service';

describe('runMusicPatchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  it('returns 400 when prompt is missing', async () => {
    const result = await runMusicPatchService({
      content: '<score-partwise version="4.0"></score-partwise>',
    });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: 'Missing prompt for music patch generation.',
    });
  });

  it('returns dry-run response without calling OpenAI', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await runMusicPatchService({
      prompt: 'Change key signature to G major',
      content: '<score-partwise version="4.0"></score-partwise>',
      dryRun: true,
      model: 'gpt-5.2',
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ready: false,
      request: {
        model: 'gpt-5.2',
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 400 when no API key is provided for non-dry-run requests', async () => {
    const result = await runMusicPatchService({
      prompt: 'Remove CLEAN VERSION text',
      content: '<score-partwise version="4.0"></score-partwise>',
    });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: 'Missing OpenAI API key for music patch generation.',
    });
  });

  it('returns 422 when model response is not a patch payload', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        output: [{ type: 'message', content: [{ text: '{"oops":true}' }] }],
      }),
    } as Response);

    const result = await runMusicPatchService({
      prompt: 'Fix beaming in measure 29',
      content: '<score-partwise version="4.0"></score-partwise>',
      apiKey: 'sk-test',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({
      error: 'Model response is not a musicxml-patch@1 payload.',
      retried: true,
    });
  });

  it('returns parsed patch for successful OpenAI responses output', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        output: [{
          type: 'message',
          content: [{
            text: '{"format":"musicxml-patch@1","ops":[{"op":"setText","path":"/score-partwise/part[@id=\\"P1\\"]/measure[@number=\\"1\\"]/attributes/key/fifths","value":"1"}]}',
          }],
        }],
      }),
    } as Response);

    const result = await runMusicPatchService({
      prompt: 'Change key signature to G major',
      content: '<score-partwise version="4.0"></score-partwise>',
      apiKey: 'sk-test',
      model: 'gpt-5.2',
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      mode: 'openai-responses',
      model: 'gpt-5.2',
      patch: {
        format: 'musicxml-patch@1',
        ops: [
          {
            op: 'setText',
            path: '/score-partwise/part[@id="P1"]/measure[@number="1"]/attributes/key/fifths',
            value: '1',
          },
        ],
      },
    });
  });
});
