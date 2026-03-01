import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  run: vi.fn(),
  runMusicContextService: vi.fn(),
  runMusicConvertService: vi.fn(),
  runMusicGenerateService: vi.fn(),
  runMusicScoreOpsPromptService: vi.fn(),
  runMusicScoreOpsService: vi.fn(),
  runMusicPatchService: vi.fn(),
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

vi.mock('../lib/music-services/scoreops-service', () => ({
  runMusicScoreOpsPromptService: mocked.runMusicScoreOpsPromptService,
  runMusicScoreOpsService: mocked.runMusicScoreOpsService,
}));

vi.mock('../lib/music-services/patch-service', () => ({
  runMusicPatchService: mocked.runMusicPatchService,
}));

import { runMusicAgentRouter } from '../lib/music-agents/router';

describe('runMusicAgentRouter Multimodal', () => {
  const priorOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    if (priorOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = priorOpenAiKey;
    }
  });

  it('passes multimodal AgentInputItem[] prompt to SDK run()', async () => {
    mocked.run.mockResolvedValue({
      finalOutput: {
        selectedTool: 'music_context',
        toolStatus: 200,
        toolOk: true,
        response: 'Analyzing PDF content...',
      },
    });

    const multimodalPrompt = [
      { type: 'input_text', text: 'Analyze this PDF score' },
      { type: 'input_file', file: { url: 'data:application/pdf;base64,AAA' }, filename: 'score.pdf' }
    ];

    const result = await runMusicAgentRouter({
      prompt: multimodalPrompt,
    });

    expect(result.status).toBe(200);
    expect(mocked.run).toHaveBeenCalledWith(
      expect.anything(),
      multimodalPrompt,
      expect.objectContaining({ maxTurns: 6 })
    );
  });

  it('extracts text from multimodal prompt for fallback router', async () => {
    // Force fallback by removing API key
    delete process.env.OPENAI_API_KEY;
    
    mocked.runMusicContextService.mockResolvedValue({
      status: 200,
      body: { strategy: 'extract-all' },
    });

    const multimodalPrompt = [
      { type: 'input_text', text: 'Analyze this PDF score' },
      { type: 'input_file', file: { url: 'data:application/pdf;base64,AAA' }, filename: 'score.pdf' }
    ];

    const result = await runMusicAgentRouter({
      prompt: multimodalPrompt,
    });

    expect(result.status).toBe(200);
    expect(result.body.selectedTool).toBe('music.context');
    expect(mocked.runMusicContextService).toHaveBeenCalled();
  });
});
