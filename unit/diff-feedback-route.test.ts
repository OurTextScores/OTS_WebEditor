import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  runDiffFeedbackService: vi.fn(),
}));

vi.mock('../lib/music-services/diff-feedback-service', () => ({
  runDiffFeedbackService: mocked.runDiffFeedbackService,
}));

import { POST } from '../app/api/music/diff/feedback/route';
import { readAiEditServiceResponse } from '../lib/ai-edit-progress-client';

describe('POST /api/music/diff/feedback', () => {
  /*
      A request that would spend a server key is gated on app-token access and
      answers 403 before the service runs — see the dedicated case below. The
      cases that exercise the service must therefore say which world they are
      in rather than inheriting the developer's exported keys, or they pass on
      CI and fail on any machine that has one.
  */
  const priorKeys = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'ALLOW_SERVER_LLM_KEYS'].map(
    (name) => [name, process.env[name]] as const,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    for (const [name] of priorKeys) delete process.env[name];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const [name, prior] of priorKeys) {
      if (prior === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = prior;
      }
    }
  });

  it('returns service response body and status', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    mocked.runDiffFeedbackService.mockResolvedValue({
      status: 200,
      body: {
        iteration: 3,
        patch: { format: 'musicxml-patch@1', ops: [] },
        proposedXml: '<score-partwise/>',
        verification: {
          level: 'patch_apply',
          attempts: 2,
          llmCalls: 2,
          effort: 'efficient',
          budget: { maxAttempts: 1, budgetMs: 60_000, requestTimeoutMs: 45_000 },
        },
      },
    });

    const response = await POST(
      new Request('http://localhost/api/music/diff/feedback', {
        method: 'POST',
        body: JSON.stringify({ scoreSessionId: 'sess_1', baseRevision: 1, blocks: [] }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      iteration: 3,
      patch: { format: 'musicxml-patch@1', ops: [] },
    });
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('"editEffort":"efficient"'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('"requestBudgetMs":60000'));
    infoSpy.mockRestore();
  });

  it('propagates service errors', async () => {
    mocked.runDiffFeedbackService.mockResolvedValue({
      status: 400,
      body: { error: 'blocks must be an array.' },
    });

    const response = await POST(
      new Request('http://localhost/api/music/diff/feedback', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'blocks must be an array.',
    });
  });

  it('streams feedback preparation and preserves a terminal error status', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    mocked.runDiffFeedbackService.mockImplementation(async (_body, options) => {
      options?.onProgress?.({ phase: 'feedback.prepared', message: 'Feedback context prepared' });
      return { status: 422, body: { error: 'No revised proposal.' } };
    });
    const response = await POST(
      new Request('http://localhost/api/music/diff/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify({ apiKey: 'sk-test', content: '<score-partwise/>', blocks: [{}] }),
      }),
    );
    const progress: Array<Record<string, unknown>> = [];

    const result = await readAiEditServiceResponse(response, (event) => progress.push(event));

    expect(response.status).toBe(200);
    expect(result).toEqual({ status: 422, body: { error: 'No revised proposal.' } });
    expect(progress.map((event) => event.phase)).toEqual(['request.accepted', 'feedback.prepared']);
    expect(mocked.runDiffFeedbackService).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        onProgress: expect.any(Function),
      }),
    );
  });
  it('refuses to spend a server key before the service is ever reached', async () => {
    process.env.OPENAI_API_KEY = 'server-key';

    const response = await POST(
      new Request('http://localhost/api/music/diff/feedback', {
        method: 'POST',
        body: JSON.stringify({ scoreSessionId: 'sess_1', baseRevision: 1, blocks: [] }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'server_credentials_disabled',
    });
    expect(mocked.runDiffFeedbackService).not.toHaveBeenCalled();
  });
});
