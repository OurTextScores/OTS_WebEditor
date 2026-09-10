import { describe, expect, it, vi } from 'vitest';

import { readAiEditServiceResponse } from '../lib/ai-edit-progress-client';
import { AI_EDIT_PROGRESS_VERSION, reportAiEditProgress } from '../lib/ai-edit-progress';
import { createAiEditProgressStreamResponse } from '../lib/ai-edit-progress-stream';

describe('AI edit progress streaming', () => {
  it('streams bounded progress events and preserves the terminal service status/body', async () => {
    const settled = vi.fn();
    const response = createAiEditProgressStreamResponse({
      operation: 'patch',
      startedAt: Date.now(),
      run: async (onProgress) => {
        onProgress({ phase: 'request.validated', message: 'Request validated' });
        onProgress({
          phase: 'provider.attempt_started',
          message: 'Contacting the model',
          attempt: 1,
          maxAttempts: 3,
          llmCalls: 1,
        });
        return { status: 422, body: { error: 'No verified candidate.' } };
      },
      onSettled: settled,
    });
    const progress: Array<Record<string, unknown>> = [];

    const result = await readAiEditServiceResponse(response, (event) => progress.push(event));

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(result).toEqual({ status: 422, body: { error: 'No verified candidate.' } });
    expect(progress.map((event) => event.phase)).toEqual([
      'request.accepted',
      'request.validated',
      'provider.attempt_started',
    ]);
    expect(progress[0]).toMatchObject({
      version: AI_EDIT_PROGRESS_VERSION,
      type: 'progress',
      operation: 'patch',
      sequence: 1,
    });
    expect(settled).toHaveBeenCalledWith({
      status: 422,
      body: { error: 'No verified candidate.' },
    });
  });

  it('keeps JSON responses compatible for non-streaming callers', async () => {
    const response = Response.json({ proposedXml: '<score-partwise/>' }, { status: 200 });

    await expect(readAiEditServiceResponse(response)).resolves.toEqual({
      status: 200,
      body: { proposedXml: '<score-partwise/>' },
    });
  });

  it('aborts request work when the response stream is cancelled', async () => {
    let observedAbort = false;
    const response = createAiEditProgressStreamResponse({
      operation: 'deep',
      startedAt: Date.now(),
      run: (_onProgress, signal) =>
        new Promise((resolve) => {
          signal.addEventListener(
            'abort',
            () => {
              observedAbort = true;
              resolve({ status: 499, body: { error: 'cancelled' } });
            },
            { once: true },
          );
        }),
    });
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    await reader?.read();
    await reader?.cancel();

    await vi.waitFor(() => expect(observedAbort).toBe(true));
  });

  it('closes normally when the settlement observer fails', async () => {
    const response = createAiEditProgressStreamResponse({
      operation: 'feedback',
      startedAt: Date.now(),
      run: async () => ({ status: 200, body: { ok: true } }),
      onSettled: () => {
        throw new Error('summary logger failed');
      },
    });

    await expect(readAiEditServiceResponse(response)).resolves.toEqual({
      status: 200,
      body: { ok: true },
    });
  });

  it('bounds messages and ignores reporter failures', () => {
    const reporter = vi.fn(() => {
      throw new Error('observer failed');
    });
    expect(() =>
      reportAiEditProgress(reporter, {
        phase: 'request.validated',
        message: `  ${'x'.repeat(300)}  `,
      }),
    ).not.toThrow();
    expect(reporter).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'x'.repeat(200),
      }),
    );
  });

  it('ignores malformed progress updates without losing the terminal result', async () => {
    const updates: unknown[] = [];
    const response = new Response(
      [
        `event: progress\ndata: ${JSON.stringify({
          version: AI_EDIT_PROGRESS_VERSION,
          type: 'progress',
          phase: 'provider.secret_payload',
          message: { unsafe: true },
        })}\n\n`,
        `event: result\ndata: ${JSON.stringify({
          version: AI_EDIT_PROGRESS_VERSION,
          type: 'result',
          status: 200,
          body: { ok: true },
        })}\n\n`,
      ].join(''),
      {
        headers: { 'content-type': 'text/event-stream' },
      },
    );

    await expect(
      readAiEditServiceResponse(response, (update) => updates.push(update)),
    ).resolves.toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(updates).toEqual([]);
  });
});
