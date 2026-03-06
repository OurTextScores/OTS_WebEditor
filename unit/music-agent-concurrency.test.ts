import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAI } from 'openai';
import { OpenAIResponsesModel } from '@openai/agents-openai';

const mocked = vi.hoisted(() => ({
  run: vi.fn(),
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

vi.mock('openai', () => {
  return {
    OpenAI: vi.fn().mockImplementation(function(config) {
      this.apiKey = config.apiKey;
    }),
  };
});

vi.mock('@openai/agents-openai', () => {
  return {
    OpenAIResponsesModel: vi.fn().mockImplementation(function(client, model) {
      this.client = client;
      this.model = model;
    }),
  };
});

import { runMusicAgentRouter } from '../lib/music-agents/router';

describe('runMusicAgentRouter Concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses scoped OpenAI clients for different API keys instead of mutating process.env', async () => {
    mocked.run.mockResolvedValue({
      finalOutput: {
        selectedTool: 'music_context',
        toolStatus: 200,
        toolOk: true,
        response: 'ok',
      },
    });

    const priorEnvKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'global-key';

    try {
      // Request 1 with key A
      await runMusicAgentRouter({
        prompt: 'Task A',
        apiKey: 'key-A',
      });

      // Request 2 with key B
      await runMusicAgentRouter({
        prompt: 'Task B',
        apiKey: 'key-B',
      });

      // Verify global env was NEVER changed
      expect(process.env.OPENAI_API_KEY).toBe('global-key');

      // Verify OpenAI was instantiated twice with correct keys
      expect(OpenAI).toHaveBeenCalledTimes(2);
      expect(OpenAI).toHaveBeenNthCalledWith(1, { apiKey: 'key-A', dangerouslyAllowBrowser: true });
      expect(OpenAI).toHaveBeenNthCalledWith(2, { apiKey: 'key-B', dangerouslyAllowBrowser: true });

      // Verify OpenAIResponsesModel was instantiated twice with respective clients
      expect(OpenAIResponsesModel).toHaveBeenCalledTimes(2);
      
    } finally {
      process.env.OPENAI_API_KEY = priorEnvKey;
    }
  });
});
