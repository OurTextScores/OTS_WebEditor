import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as postOpenAiModels } from '../app/api/llm/openai/models/route';

describe('LLM proxy security gates', () => {
  const priorAllowProxy = process.env.ALLOW_UNAUTHENTICATED_LLM_PROXY;
  const priorAppToken = process.env.OTS_API_AUTH_TOKEN;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.ALLOW_UNAUTHENTICATED_LLM_PROXY;
    delete process.env.OTS_API_AUTH_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (priorAllowProxy === undefined) {
      delete process.env.ALLOW_UNAUTHENTICATED_LLM_PROXY;
    } else {
      process.env.ALLOW_UNAUTHENTICATED_LLM_PROXY = priorAllowProxy;
    }
    if (priorAppToken === undefined) {
      delete process.env.OTS_API_AUTH_TOKEN;
    } else {
      process.env.OTS_API_AUTH_TOKEN = priorAppToken;
    }
  });

  it('blocks proxy calls when no app token or explicit public opt-in is configured', async () => {
    const response = await postOpenAiModels(
      new Request('http://localhost/api/llm/openai/models', {
        method: 'POST',
        body: JSON.stringify({ apiKey: 'sk-user' }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'api_auth_not_configured',
    });
  });

  it('does not return upstream provider error bodies verbatim', async () => {
    process.env.ALLOW_UNAUTHENTICATED_LLM_PROXY = '1';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'provider-secret-detail',
    } as Response);

    const response = await postOpenAiModels(
      new Request('http://localhost/api/llm/openai/models', {
        method: 'POST',
        body: JSON.stringify({ apiKey: 'sk-user' }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: 'OpenAI request failed.',
      providerStatus: 401,
    });
  });
});
