import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScoreOpsSession,
  clearScoreOpsSessions,
} from '../lib/music-services/scoreops-session-store';

type MockAgentTool = {
  name: string;
  execute: (input: unknown, runContext: unknown) => Promise<unknown>;
};

type MockAgent = {
  tools: MockAgentTool[];
};

type MockRunOptions = {
  context: unknown;
};

const mocked = vi.hoisted(() => ({
  run: vi.fn(),
  runMusicContextService: vi.fn(),
  runMusicConvertService: vi.fn(),
  runDiffFeedbackService: vi.fn(),
  runFunctionalHarmonyAnalyzeService: vi.fn(),
  runMusicGenerateService: vi.fn(),
  runHarmonyAnalyzeService: vi.fn(),
  runMusicScoreOpsPromptService: vi.fn(),
  runMusicScoreOpsPreviewService: vi.fn(),
  runMusicPatchService: vi.fn(),
  runMusicRenderService: vi.fn(),
}));

vi.mock('@openai/agents', () => {
  class Agent {
    [key: string]: unknown;
    instructions: string = '';
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

vi.mock('../lib/music-services/diff-feedback-service', () => ({
  runDiffFeedbackService: mocked.runDiffFeedbackService,
}));

vi.mock('../lib/music-services/functional-harmony-service', () => ({
  runFunctionalHarmonyAnalyzeService: mocked.runFunctionalHarmonyAnalyzeService,
}));

vi.mock('../lib/music-services/generate-service', () => ({
  runMusicGenerateService: mocked.runMusicGenerateService,
}));

vi.mock('../lib/music-services/harmony-service', () => ({
  runHarmonyAnalyzeService: mocked.runHarmonyAnalyzeService,
}));

vi.mock('../lib/music-services/scoreops-service', () => ({
  runMusicScoreOpsPromptService: mocked.runMusicScoreOpsPromptService,
  runMusicScoreOpsPreviewService: mocked.runMusicScoreOpsPreviewService,
}));

vi.mock('../lib/music-services/patch-service', () => ({
  runMusicPatchService: mocked.runMusicPatchService,
}));

vi.mock('../lib/music-services/render-service', () => ({
  runMusicRenderService: mocked.runMusicRenderService,
}));

import { runMusicAgentRouter } from '../lib/music-agents/router';

describe('runMusicAgentRouter Sessions', () => {
  const priorOpenAiKey = process.env.OPENAI_API_KEY;
  const priorAllowServerKeys = process.env.ALLOW_SERVER_LLM_KEYS;

  beforeEach(() => {
    vi.clearAllMocks();
    clearScoreOpsSessions();
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.ALLOW_SERVER_LLM_KEYS = '1';
  });

  afterEach(() => {
    if (priorOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = priorOpenAiKey;
    }
    if (priorAllowServerKeys === undefined) {
      delete process.env.ALLOW_SERVER_LLM_KEYS;
    } else {
      process.env.ALLOW_SERVER_LLM_KEYS = priorAllowServerKeys;
    }
  });

  it('passes scoreSessionId to Agent and tools', async () => {
    // Create a dummy session
    const session = createScoreOpsSession({
      content: '<score-partwise/>',
      artifactId: 'art_123',
    });

    mocked.run.mockImplementation(
      async (agent: MockAgent, _prompt: unknown, options: MockRunOptions) => {
        // Simulate tool call by the agent
        const tool = agent.tools.find((candidate) => candidate.name === 'music.context');
        if (!tool) {
          throw new Error('Expected music.context tool to be registered.');
        }
        // The SDK passes a RunContext which has the 'context' property
        // options.context IS our MusicAgentRunnerContext
        await tool.execute({ include_abc: true }, { context: options.context });

        return {
          finalOutput: {
            selectedTool: 'music_context',
            toolStatus: 200,
            toolOk: true,
            response: 'Context loaded from session.',
          },
        };
      },
    );

    mocked.runMusicContextService.mockResolvedValue({
      status: 200,
      body: { ok: true, scoreSessionId: session.scoreSessionId },
    });

    const result = await runMusicAgentRouter({
      prompt: 'Analyze this',
      scoreSessionId: session.scoreSessionId,
      baseRevision: 0,
    });

    expect(result.status).toBe(200);
    // Verify tool was called with session info from defaults
    expect(mocked.runMusicContextService).toHaveBeenCalledWith(
      expect.objectContaining({
        scoreSessionId: session.scoreSessionId,
        baseRevision: 0,
      }),
    );
  });
});
