import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScoreOpsSession, clearScoreOpsSessions } from '../lib/music-services/scoreops-session-store';

const mocked = vi.hoisted(() => ({
  run: vi.fn(),
  runMusicContextService: vi.fn(),
  runMusicConvertService: vi.fn(),
  runDiffFeedbackService: vi.fn(),
  runMusicGenerateService: vi.fn(),
  runMusicScoreOpsPromptService: vi.fn(),
  runMusicScoreOpsService: vi.fn(),
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
  runMusicContextService: (payload: any) => mocked.runMusicContextService(payload),
}));

vi.mock('../lib/music-services/convert-service', () => ({
  runMusicConvertService: (payload: any) => mocked.runMusicConvertService(payload),
}));

vi.mock('../lib/music-services/diff-feedback-service', () => ({
  runDiffFeedbackService: (payload: any) => mocked.runDiffFeedbackService(payload),
}));

vi.mock('../lib/music-services/generate-service', () => ({
  runMusicGenerateService: (payload: any) => mocked.runMusicGenerateService(payload),
}));

vi.mock('../lib/music-services/scoreops-service', () => ({
  runMusicScoreOpsPromptService: (payload: any) => mocked.runMusicScoreOpsPromptService(payload),
  runMusicScoreOpsService: (payload: any) => mocked.runMusicScoreOpsService(payload),
}));

vi.mock('../lib/music-services/patch-service', () => ({
  runMusicPatchService: (payload: any) => mocked.runMusicPatchService(payload),
}));

vi.mock('../lib/music-services/render-service', () => ({
  runMusicRenderService: (payload: any) => mocked.runMusicRenderService(payload),
}));

import { runMusicAgentRouter } from '../lib/music-agents/router';

describe('runMusicAgentRouter Sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearScoreOpsSessions();
  });

  it('passes scoreSessionId to Agent and tools', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    
    // Create a dummy session
    const session = createScoreOpsSession({
      content: '<score-partwise/>',
      artifactId: 'art_123',
    });

    mocked.run.mockImplementation(async (agent, prompt, options) => {
      // Simulate tool call by the agent
      const tool = agent.tools.find((t: any) => t.name === 'music.context');
      // The SDK passes a RunContext which has the 'context' property
      // options.context IS our MusicAgentRunnerContext
      const toolResult = await tool.execute({ include_abc: true }, { context: options.context });
      
      return {
        finalOutput: {
          selectedTool: 'music_context',
          toolStatus: 200,
          toolOk: true,
          response: 'Context loaded from session.',
        },
      };
    });

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
    expect(mocked.runMusicContextService).toHaveBeenCalledWith(expect.objectContaining({
      scoreSessionId: session.scoreSessionId,
      baseRevision: 0,
    }));
  });
});
