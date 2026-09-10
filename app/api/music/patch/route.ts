import { NextResponse } from 'next/server';
import { requireSensitiveApiAccess } from '../../../../lib/api-access-control';
import { logApiRouteSummary } from '../../../../lib/api-route-logging';
import { runMusicPatchService } from '../../../../lib/music-services/patch-service';
import { applyTraceHeaders, resolveTraceContext } from '../../../../lib/trace-http';
import {
  createAiEditProgressStreamResponse,
  wantsAiEditProgressStream,
} from '../../../../lib/ai-edit-progress-stream';

export const runtime = 'nodejs';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

export async function POST(request: Request) {
  const startedAt = Date.now();
  const trace = resolveTraceContext(request);
  let status = 500;
  let summaryExtra: Record<string, unknown> = {};
  let streamOwnsSummary = false;
  const recordResultSummary = (result: { status: number; body: Record<string, unknown> }) => {
    status = result.status;
    const verification = asRecord(result.body.verification);
    const budget = asRecord(verification?.budget);
    const authorizedModelDescriptor = asRecord(result.body.modelDescriptor);
    const failures = Array.isArray(result.body.failures) ? result.body.failures : [];
    const lastFailure = asRecord(failures.at(-1));
    summaryExtra = {
      ...summaryExtra,
      verificationLevel: typeof verification?.level === 'string' ? verification.level : null,
      attempts: typeof verification?.attempts === 'number' ? verification.attempts : null,
      llmCalls: typeof verification?.llmCalls === 'number' ? verification.llmCalls : null,
      verificationElapsedMs:
        typeof verification?.elapsedMs === 'number' ? verification.elapsedMs : null,
      editEffort: typeof verification?.effort === 'string' ? verification.effort : null,
      requestBudgetMs: typeof budget?.budgetMs === 'number' ? budget.budgetMs : null,
      serverModelDescriptorSource:
        typeof authorizedModelDescriptor?.source === 'string'
          ? authorizedModelDescriptor.source
          : null,
      errorCategory:
        typeof lastFailure?.category === 'string'
          ? lastFailure.category
          : status === 200
            ? null
            : status === 413
              ? 'resource_limit'
              : status === 504
                ? 'timeout'
                : status === 502
                  ? 'provider'
                  : status === 422
                    ? 'verification'
                    : 'request',
    };
  };
  const logSummary = () =>
    logApiRouteSummary({
      event: 'music.patch.summary',
      route: '/api/music/patch',
      method: 'POST',
      status,
      startedAt,
      trace,
      extra: summaryExtra,
    });
  try {
    const access = requireSensitiveApiAccess({
      request,
      trace,
      route: '/api/music/patch',
      allowUnauthenticatedEnvVar: 'ALLOW_UNAUTHENTICATED_LLM_PROXY',
    });
    if (!access.ok) {
      status = access.response.status;
      return access.response;
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      status = 400;
      const response = NextResponse.json({ error: 'Request body must be valid JSON.' }, { status });
      applyTraceHeaders(response.headers, trace);
      return response;
    }
    const data = asRecord(body);
    const clientModelDescriptor = asRecord(data?.modelDescriptor);
    summaryExtra = {
      provider: typeof data?.provider === 'string' ? data.provider.slice(0, 32) : null,
      model: typeof data?.model === 'string' ? data.model.slice(0, 128) : null,
      clientModelDescriptorId:
        typeof clientModelDescriptor?.id === 'string'
          ? clientModelDescriptor.id.slice(0, 128)
          : null,
      clientModelDescriptorSource:
        typeof clientModelDescriptor?.source === 'string'
          ? clientModelDescriptor.source.slice(0, 32)
          : null,
    };
    if (typeof data?.content !== 'string' || !data.content.trim()) {
      status = 400;
      const response = NextResponse.json(
        { error: 'Base MusicXML content is required.' },
        { status },
      );
      applyTraceHeaders(response.headers, trace);
      return response;
    }

    if (wantsAiEditProgressStream(request)) {
      streamOwnsSummary = true;
      const response = createAiEditProgressStreamResponse({
        operation: 'patch',
        startedAt,
        parentSignal: request.signal,
        run: async (onProgress, signal) => {
          const result = await runMusicPatchService(body, {
            traceContext: trace,
            signal,
            onProgress,
          });
          recordResultSummary(result);
          return result;
        },
        onSettled: logSummary,
      });
      applyTraceHeaders(response.headers, trace);
      return response;
    }

    const result = await runMusicPatchService(body, {
      traceContext: trace,
      signal: request.signal,
    });
    recordResultSummary(result);
    const response = NextResponse.json(result.body, { status });
    applyTraceHeaders(response.headers, trace);
    return response;
  } finally {
    if (!streamOwnsSummary) {
      logSummary();
    }
  }
}
