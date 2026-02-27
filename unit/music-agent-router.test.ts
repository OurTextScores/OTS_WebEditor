import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  run: vi.fn(),
  runMusicContextService: vi.fn(),
  runMusicConvertService: vi.fn(),
  runMusicGenerateService: vi.fn(),
}));

vi.mock('@openai/agents', () => {
  class Agent {
    [key: string]: unknown;
    constructor(config: Record<string, unknown>) {
      Object.assign(this, config);
    }
  }
  return {
    Agent,
    run: mocked.run,
    tool: (options: Record<string, unknown>) => options,
  };
});

vi.mock('../lib/music-services/context-service', () => ({
  runMusicContextService: mocked.runMusicContextService,
}));

vi.mock('../lib/music-services/convert-service', () => ({
  runMusicConvertService: mocked.runMusicConvertService,
}));

vi.mock('../lib/music-services/generate-service', () => ({
  runMusicGenerateService: mocked.runMusicGenerateService,
}));

import { runMusicAgentRouter } from '../lib/music-agents/router';

describe('runMusicAgentRouter', () => {
  const priorOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (priorOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = priorOpenAiKey;
    }
  });

  it('returns 400 when prompt is missing', async () => {
    const result = await runMusicAgentRouter({});
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: 'Missing prompt for music agent router.' });
  });

  it('uses fallback router and context service when OPENAI_API_KEY is not set', async () => {
    delete process.env.OPENAI_API_KEY;
    mocked.runMusicContextService.mockResolvedValue({
      status: 200,
      body: { strategy: 'musicxml-primary' },
    });

    const result = await runMusicAgentRouter({
      prompt: 'Analyze this score context',
      toolInput: {
        context: {
          content: '<score-partwise version="3.1"></score-partwise>',
        },
      },
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      mode: 'fallback',
      selectedTool: 'music.context',
      toolOk: true,
    });
    expect(mocked.runMusicContextService).toHaveBeenCalledWith({
      content: '<score-partwise version="3.1"></score-partwise>',
    });
  });

  it('uses fallback router and generate service for composition prompts', async () => {
    delete process.env.OPENAI_API_KEY;
    mocked.runMusicGenerateService.mockResolvedValue({
      status: 200,
      body: { specialist: 'notagen', generation: null },
    });

    const result = await runMusicAgentRouter({
      prompt: 'Compose a short melody in C major',
      toolInput: {
        generate: {
          backend: 'huggingface',
          hfToken: 'hf_test_token',
          modelId: 'ElectricAlexis/NotaGen',
        },
      },
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      mode: 'fallback',
      selectedTool: 'music.generate',
    });
    expect(mocked.runMusicGenerateService).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: 'huggingface',
        hfToken: 'hf_test_token',
        modelId: 'ElectricAlexis/NotaGen',
        dryRun: true,
      }),
    );
  });

  it('uses Agents SDK path when OPENAI_API_KEY is set', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    mocked.run.mockResolvedValue({
      finalOutput: {
        selectedTool: 'music.context',
        toolStatus: 200,
        toolOk: true,
        response: 'Used music.context for targeted extraction.',
      },
    });

    const result = await runMusicAgentRouter({
      prompt: 'Find relevant context around measure 8',
      model: 'gpt-5.2',
      maxTurns: 3,
      toolInput: {
        context: {
          inputArtifactId: 'art-1',
        },
      },
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      mode: 'agents-sdk',
      model: 'gpt-5.2',
      selectedTool: 'music.context',
      toolStatus: 200,
      toolOk: true,
    });
    expect(mocked.run).toHaveBeenCalledTimes(1);
  });

  it('returns 500 if agents-sdk execution throws', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    mocked.run.mockRejectedValue(new Error('agents run failed'));

    const result = await runMusicAgentRouter({
      prompt: 'Convert this to abc',
    });

    expect(result.status).toBe(500);
    expect(result.body).toMatchObject({
      mode: 'agents-sdk',
      error: 'agents run failed',
    });
  });
});

