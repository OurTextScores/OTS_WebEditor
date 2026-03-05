import { NextResponse } from 'next/server';
import { logApiRouteSummary } from '../../../../../../lib/api-route-logging';
import { runChordGanTransferStreamService } from '../../../../../../lib/music-services/chordgan-service';
import { MusicServiceError } from '../../../../../../lib/music-services/errors';
import { applyTraceHeaders, resolveTraceContext, withTraceHeaders } from '../../../../../../lib/trace-http';

export const runtime = 'nodejs';

const encodeSse = (event: string, payload: unknown) => `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;

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
    const result = await runChordGanTransferStreamService(await request.json(), { traceContext: trace });
    if (result.status !== 200 || !result.events) {
      status = result.status;
      return tracedJson(result.body || { error: 'ChordGAN stream request failed.' }, { status });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of result.events || []) {
          controller.enqueue(encoder.encode(encodeSse(event.event, event.data)));
        }
        controller.close();
      },
    });

    status = 200;
    return new Response(stream, {
      status,
      headers: withTraceHeaders(trace, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      }),
    });
  } catch (error) {
    if (error instanceof MusicServiceError) {
      status = error.status;
      return tracedJson({ error: error.message }, { status });
    }
    status = 500;
    const message = error instanceof Error ? error.message : 'ChordGAN transfer stream route error.';
    return tracedJson({ error: message }, { status });
  } finally {
    logApiRouteSummary({
      event: 'music.chordgan.transfer.stream.summary',
      route: '/api/music/chordgan/transfer/stream',
      method: 'POST',
      status,
      startedAt,
      trace,
    });
  }
}
