import { NextResponse } from 'next/server';
import { runMusicScoreOpsService } from '../../../../../lib/music-services/scoreops-service';
import { logApiRouteSummary } from '../../../../../lib/api-route-logging';
import { applyTraceHeaders, resolveTraceContext } from '../../../../../lib/trace-http';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const startedAt = Date.now();
  const trace = resolveTraceContext(request);
  let status = 500;
  try {
    const result = await runMusicScoreOpsService(await request.json(), 'sync');
    status = result.status;
    const response = NextResponse.json(result.body, { status: result.status });
    applyTraceHeaders(response.headers, trace);
    return response;
  } finally {
    logApiRouteSummary({
      event: 'scoreops.sync.summary',
      route: '/api/music/scoreops/sync',
      method: 'POST',
      status,
      startedAt,
      trace,
    });
  }
}
