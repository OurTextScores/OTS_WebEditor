import { NextResponse } from 'next/server';
import { logApiRouteSummary } from '../../../../../lib/api-route-logging';
import { runDiffFeedbackService } from '../../../../../lib/music-services/diff-feedback-service';
import { applyTraceHeaders, resolveTraceContext } from '../../../../../lib/trace-http';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const startedAt = Date.now();
  const trace = resolveTraceContext(request);
  let status = 500;
  try {
    const result = await runDiffFeedbackService(await request.json(), { traceContext: trace });
    status = result.status;
    const response = NextResponse.json(result.body, { status: result.status });
    applyTraceHeaders(response.headers, trace);
    return response;
  } finally {
    logApiRouteSummary({
      event: 'diff.feedback.summary',
      route: '/api/music/diff/feedback',
      method: 'POST',
      status,
      startedAt,
      trace,
    });
  }
}
