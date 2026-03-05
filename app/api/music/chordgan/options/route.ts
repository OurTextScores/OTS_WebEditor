import { NextResponse } from 'next/server';
import { logApiRouteSummary } from '../../../../../lib/api-route-logging';
import { runChordGanOptionsService } from '../../../../../lib/music-services/chordgan-service';
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
    const result = await runChordGanOptionsService(await request.json(), { traceContext: trace });
    status = result.status;
    return tracedJson(result.body, { status });
  } catch (error) {
    if (error instanceof MusicServiceError) {
      status = error.status;
      return tracedJson({ error: error.message }, { status });
    }
    status = 500;
    const message = error instanceof Error ? error.message : 'ChordGAN options route error.';
    return tracedJson({ error: message }, { status });
  } finally {
    logApiRouteSummary({
      event: 'music.chordgan.options.summary',
      route: '/api/music/chordgan/options',
      method: 'POST',
      status,
      startedAt,
      trace,
    });
  }
}
