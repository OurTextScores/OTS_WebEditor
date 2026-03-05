import { NextResponse } from 'next/server';
import { logApiRouteSummary } from '../../../../../lib/api-route-logging';
import { runChordGanTransferService } from '../../../../../lib/music-services/chordgan-service';
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
    const result = await runChordGanTransferService(await request.json(), { traceContext: trace });
    status = result.status;
    return tracedJson(result.body, { status });
  } catch (error) {
    if (error instanceof MusicServiceError) {
      status = error.status;
      return tracedJson({ error: error.message }, { status });
    }
    status = 500;
    const message = error instanceof Error ? error.message : 'ChordGAN transfer route error.';
    return tracedJson({ error: message }, { status });
  } finally {
    logApiRouteSummary({
      event: 'music.chordgan.transfer.summary',
      route: '/api/music/chordgan/transfer',
      method: 'POST',
      status,
      startedAt,
      trace,
    });
  }
}
