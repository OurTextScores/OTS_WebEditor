import { NextResponse } from 'next/server';
import { logApiRouteSummary } from '../../../../../lib/api-route-logging';
import { runMusicConvertService } from '../../../../../lib/music-services/convert-service';
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
    const result = await runMusicConvertService(
      {
        ...body,
        inputFormat: 'kern',
        outputFormat: 'musicxml',
      },
      { traceContext: trace },
    );
    status = result.status;
    return tracedJson(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof MusicServiceError) {
      status = error.status;
      return tracedJson({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Kern to MusicXML conversion error.';
    status = /tools unavailable/i.test(message) ? 503 : 500;
    return tracedJson({ error: message }, { status });
  } finally {
    logApiRouteSummary({
      event: 'music.kern.to_musicxml.summary',
      route: '/api/music/kern/to-musicxml',
      method: 'POST',
      status,
      startedAt,
      trace,
    });
  }
}
