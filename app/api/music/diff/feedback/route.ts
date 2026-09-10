import { NextResponse } from 'next/server';
import { requireServerCredentialAccess } from '../../../../../lib/api-access-control';
import { logApiRouteSummary } from '../../../../../lib/api-route-logging';
import { runDiffFeedbackService } from '../../../../../lib/music-services/diff-feedback-service';
import { applyTraceHeaders, resolveTraceContext } from '../../../../../lib/trace-http';
import {
  createAiEditProgressStreamResponse,
  wantsAiEditProgressStream,
} from '../../../../../lib/ai-edit-progress-stream';

export const runtime = 'nodejs';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const readTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const routeWouldUseServerAiKey = (body: unknown) => {
  const data = asRecord(body);
  const requestApiKey = readTrimmedString(data?.apiKey) || readTrimmedString(data?.api_key);
  if (requestApiKey) {
    return false;
  }
  const provider = readTrimmedString(data?.provider).toLowerCase();
  if (provider === 'anthropic') {
    return Boolean((process.env.ANTHROPIC_API_KEY || '').trim());
  }
  if (provider === 'gemini') {
    return Boolean((process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim());
  }
  if (provider === 'grok') {
    return Boolean((process.env.GROK_API_KEY || process.env.OPENAI_API_KEY || '').trim());
  }
  if (provider === 'deepseek') {
    return Boolean((process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '').trim());
  }
  if (provider === 'kimi') {
    return Boolean((process.env.KIMI_API_KEY || process.env.OPENAI_API_KEY || '').trim());
  }
  return Boolean((process.env.OPENAI_API_KEY || '').trim());
};

export async function POST(request: Request) {
  const startedAt = Date.now();
  const trace = resolveTraceContext(request);
  let status = 500;
  let summaryExtra: Record<string, unknown> = {};
  let streamOwnsSummary = false;
  const recordResultSummary = (result: { status: number; body: Record<string, unknown> }) => {
    status = result.status;
    const audit = asRecord(result.body.audit);
    const feedbackCounts = asRecord(audit?.feedbackCounts);
    const contextFlags = asRecord(audit?.proposalContext);
    const verification = asRecord(result.body.verification);
    const budget = asRecord(verification?.budget);
    summaryExtra = {
      proposalSessionId:
        typeof result.body.proposalSessionId === 'string' ? result.body.proposalSessionId : null,
      cycle: typeof audit?.cycle === 'number' ? audit.cycle : null,
      feedbackCounts: feedbackCounts ?? null,
      contextProvided: contextFlags?.provided === true,
      contextLineage: typeof contextFlags?.lineage === 'string' ? contextFlags.lineage : null,
      previousCycleDropped: contextFlags?.previousCycleDropped === true,
      contextTruncated: Array.isArray(contextFlags?.truncated) ? contextFlags.truncated.length : 0,
      verificationLevel: typeof verification?.level === 'string' ? verification.level : null,
      attempts: typeof verification?.attempts === 'number' ? verification.attempts : null,
      llmCalls: typeof verification?.llmCalls === 'number' ? verification.llmCalls : null,
      editEffort: typeof verification?.effort === 'string' ? verification.effort : null,
      requestBudgetMs: typeof budget?.budgetMs === 'number' ? budget.budgetMs : null,
      providerStatus:
        typeof result.body.providerStatus === 'number' ? result.body.providerStatus : null,
      errorCategory:
        status < 400
          ? null
          : status === 400
            ? 'request'
            : status === 422
              ? 'verification'
              : status === 504
                ? 'timeout'
                : 'provider',
    };
  };
  const logSummary = () =>
    logApiRouteSummary({
      event: 'diff.feedback.summary',
      route: '/api/music/diff/feedback',
      method: 'POST',
      status,
      startedAt,
      trace,
      extra: summaryExtra,
    });
  try {
    const body = await request.json();
    if (routeWouldUseServerAiKey(body)) {
      const access = requireServerCredentialAccess({
        request,
        trace,
        route: '/api/music/diff/feedback',
      });
      if (!access.ok) {
        status = access.response.status;
        return access.response;
      }
    }
    if (wantsAiEditProgressStream(request)) {
      streamOwnsSummary = true;
      const response = createAiEditProgressStreamResponse({
        operation: 'feedback',
        startedAt,
        parentSignal: request.signal,
        run: async (onProgress, signal) => {
          const result = await runDiffFeedbackService(body, {
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

    const result = await runDiffFeedbackService(body, {
      traceContext: trace,
      signal: request.signal,
    });
    recordResultSummary(result);
    const response = NextResponse.json(result.body, { status: result.status });
    applyTraceHeaders(response.headers, trace);
    return response;
  } finally {
    if (!streamOwnsSummary) {
      logSummary();
    }
  }
}
