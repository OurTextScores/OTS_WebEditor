import { NextResponse } from 'next/server';
import { logApiRouteSummary } from '../../../../../lib/api-route-logging';
import { MusicServiceError } from '../../../../../lib/music-services/errors';
import { runHarmonyAnalyzeService } from '../../../../../lib/music-services/harmony-service';
import { applyTraceHeaders, resolveTraceContext } from '../../../../../lib/trace-http';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const startedAt = Date.now();
  const trace = resolveTraceContext(request);
  let status = 500;
  const tracedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    applyTraceHeaders(response.headers, trace);
    return response;
  };

  try {
    const result = await runHarmonyAnalyzeService(await request.json(), { traceContext: trace });
    status = result.status;
    return tracedJson(result.body, { status });
  } catch (error) {
    if (error instanceof MusicServiceError) {
      status = error.status;
      return tracedJson({ error: error.message }, { status });
    }
    const message = error instanceof Error ? error.message : 'Harmony analysis error.';
    status = 500;
    return tracedJson({ error: message }, { status });
  } finally {
    logApiRouteSummary({
      event: 'music.harmony.analyze.summary',
      route: '/api/music/harmony/analyze',
      method: 'POST',
      status,
      startedAt,
      trace,
    });
  }
}
