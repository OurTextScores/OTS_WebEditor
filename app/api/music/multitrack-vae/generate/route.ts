import { NextResponse } from 'next/server';
import { logApiRouteSummary } from '../../../../../lib/api-route-logging';
import { runMusicMultitrackVaeService } from '../../../../../lib/music-services/multitrack-vae-service';
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
    const body = await request.json();
    const result = await runMusicMultitrackVaeService(body, { traceContext: trace });
    status = result.status;
    return tracedJson(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof MusicServiceError) {
      status = error.status;
      return tracedJson({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : 'Multitrack MusicVAE generation error.';
    status = /@magenta\/music|checkpoint|initialize|tfjs|tensorflow|timed out/i.test(message)
      ? 503
      : 500;
    console.error('[music.multitrack_vae.generate] request failed', {
      status,
      message,
      traceId: trace.traceId,
      requestId: trace.requestId,
    });
    return tracedJson(
      {
        error: {
          message,
          traceId: trace.traceId,
          requestId: trace.requestId,
        },
      },
      { status },
    );
  } finally {
    logApiRouteSummary({
      event: 'music.multitrack_vae.generate.summary',
      route: '/api/music/multitrack-vae/generate',
      method: 'POST',
      status,
      startedAt,
      trace,
    });
  }
}
