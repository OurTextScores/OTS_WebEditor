import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  runDeepEditService: vi.fn(),
}));

vi.mock('../lib/music-services/deep-edit-service', () => ({
  runDeepEditService: mocked.runDeepEditService,
}));

import { POST } from '../app/api/music/patch/deep/route';
import { readAiEditServiceResponse } from '../lib/ai-edit-progress-client';

describe('POST /api/music/patch/deep', () => {
  const priorAllowProxy = process.env.ALLOW_UNAUTHENTICATED_LLM_PROXY;
  const priorAppToken = process.env.OTS_API_AUTH_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it('blocks calls when no app token or explicit public opt-in is configured', async () => {
    const response = await POST(
      new Request('http://localhost/api/music/patch/deep', {
        method: 'POST',
        body: JSON.stringify({ content: '<score-partwise/>' }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'api_auth_not_configured',
    });
    expect(mocked.runDeepEditService).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON and missing MusicXML before calling the service', async () => {
    process.env.ALLOW_UNAUTHENTICATED_LLM_PROXY = '1';

    const invalidJson = await POST(
      new Request('http://localhost/api/music/patch/deep', {
        method: 'POST',
        body: '{',
      }),
    );
    const missingContent = await POST(
      new Request('http://localhost/api/music/patch/deep', {
        method: 'POST',
        body: JSON.stringify({ prompt: 'transpose' }),
      }),
    );

    expect(invalidJson.status).toBe(400);
    expect(missingContent.status).toBe(400);
    expect(mocked.runDeepEditService).not.toHaveBeenCalled();
  });

  it('forwards authenticated requests with cancellation and returns the deep-edit body', async () => {
    process.env.OTS_API_AUTH_TOKEN = 'app-token';
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    mocked.runDeepEditService.mockResolvedValue({
      status: 200,
      body: {
        proposal: {
          sourceTool: 'music.deep_edit',
          verification: { level: 'engine_load', llmCalls: 4 },
        },
        proposalSessionId: 'sess-deep-1',
        cycle: 1,
        deepEdit: {
          effort: 'thorough',
          budgets: { budgetMs: 600_000 },
          finalizedCandidateId: 'cand-2',
          rationale: 'Best of two.',
          candidates: [{ id: 'cand-1' }, { id: 'cand-2' }],
          counters: { llmCalls: 4, toolCalls: 7, renders: 1 },
          elapsedMs: 1234,
        },
      },
    });

    const response = await POST(
      new Request('http://localhost/api/music/patch/deep', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ots-api-token': 'app-token',
          'x-request-id': 'req-deep-1',
        },
        body: JSON.stringify({ content: '<score-partwise/>', prompt: 'Improve the voicing.' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBe('req-deep-1');
    await expect(response.json()).resolves.toMatchObject({
      proposalSessionId: 'sess-deep-1',
      deepEdit: { finalizedCandidateId: 'cand-2' },
    });
    expect(mocked.runDeepEditService).toHaveBeenCalledWith(
      expect.objectContaining({ content: '<score-partwise/>', prompt: 'Improve the voicing.' }),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        traceContext: expect.objectContaining({ requestId: 'req-deep-1' }),
      }),
    );
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('"editEffort":"thorough"'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('"requestBudgetMs":600000'));
    infoSpy.mockRestore();
  });

  it('streams sandbox milestones and the terminal deep-edit result', async () => {
    process.env.OTS_API_AUTH_TOKEN = 'app-token';
    vi.spyOn(console, 'info').mockImplementation(() => {});
    mocked.runDeepEditService.mockImplementation(async (_body, options) => {
      options?.onProgress?.({ phase: 'deep.started', message: 'Deep Edit sandbox started' });
      return {
        status: 200,
        body: { proposedXml: '<score-partwise/>', deepEdit: { counters: { llmCalls: 1 } } },
      };
    });
    const response = await POST(
      new Request('http://localhost/api/music/patch/deep', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
          'x-ots-api-token': 'app-token',
        },
        body: JSON.stringify({ content: '<score-partwise/>', prompt: 'Improve it.' }),
      }),
    );
    const progress: Array<Record<string, unknown>> = [];

    const result = await readAiEditServiceResponse(response, (event) => progress.push(event));

    expect(result).toMatchObject({ status: 200, body: { proposedXml: '<score-partwise/>' } });
    expect(progress.map((event) => event.phase)).toEqual(['request.accepted', 'deep.started']);
    expect(mocked.runDeepEditService).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        onProgress: expect.any(Function),
      }),
    );
  });

  it('propagates typed service errors with their category', async () => {
    process.env.ALLOW_UNAUTHENTICATED_LLM_PROXY = '1';
    mocked.runDeepEditService.mockResolvedValue({
      status: 422,
      body: {
        error: 'Deep edit ran out of budget before finalizing a candidate.',
        errorCategory: 'budget_exhausted',
        deepEdit: {
          finalizedCandidateId: null,
          candidates: [],
          counters: { llmCalls: 12, toolCalls: 24, renders: 0 },
          elapsedMs: 9,
        },
      },
    });

    const response = await POST(
      new Request('http://localhost/api/music/patch/deep', {
        method: 'POST',
        body: JSON.stringify({ content: '<score-partwise/>', prompt: 'x' }),
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      errorCategory: 'budget_exhausted',
    });
  });
});
