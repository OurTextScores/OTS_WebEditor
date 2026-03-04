import { NextResponse } from 'next/server';
import { logApiRouteSummary } from '../../../../../lib/api-route-logging';
import { runMmaRenderService } from '../../../../../lib/music-services/mma-service';
import { MusicServiceError } from '../../../../../lib/music-services/errors';
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
    const result = await runMmaRenderService(await request.json(), { traceContext: trace });
    status = result.status;
    return tracedJson(result.body, { status });
  } catch (error) {
    if (error instanceof MusicServiceError) {
      status = error.status;
      return tracedJson({ error: error.message }, { status });
    }
    const message = error instanceof Error ? error.message : 'MMA render error.';
    status = /timed out/i.test(message) ? 408 : 500;
    return tracedJson({ error: message }, { status });
  } finally {
    logApiRouteSummary({
      event: 'music.mma.render.summary',
      route: '/api/music/mma/render',
      method: 'POST',
      status,
      startedAt,
      trace,
    });
  }
}
