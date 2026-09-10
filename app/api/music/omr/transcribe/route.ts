import { NextResponse } from 'next/server';
import { requireServerCredentialAccess } from '../../../../../lib/api-access-control';
import { logApiRouteSummary } from '../../../../../lib/api-route-logging';
import { runMusicOmrTranscribeService } from '../../../../../lib/music-services/omr-service';
import { MusicServiceError } from '../../../../../lib/music-services/errors';
import { applyTraceHeaders, resolveTraceContext } from '../../../../../lib/trace-http';

export const runtime = 'nodejs';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const readTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

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
    const data = asRecord(body);
    const requestHfToken = readTrimmedString(data?.hfToken ?? data?.hf_token);
    if (
      !requestHfToken &&
      (process.env.MUSIC_TRANSCODA_SPACE_TOKEN || process.env.HF_TOKEN || '').trim()
    ) {
      const access = requireServerCredentialAccess({
        request,
        trace,
        route: '/api/music/omr/transcribe',
      });
      if (!access.ok) {
        status = access.response.status;
        return access.response;
      }
    }
    const result = await runMusicOmrTranscribeService(body, { traceContext: trace });
    status = result.status;
    return tracedJson(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof MusicServiceError) {
      status = error.status;
      return tracedJson({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'OMR transcription error.';
    status = /tools unavailable|timed out|Transcoda Space/i.test(message) ? 503 : 500;
    const details =
      error && typeof error === 'object' && 'details' in error
        ? (error as { details?: unknown }).details
        : undefined;
    console.error('[music.omr.transcribe] request failed', {
      status,
      message,
      traceId: trace.traceId,
      requestId: trace.requestId,
      details,
    });
    return tracedJson(
      {
        error: {
          message,
          details,
          traceId: trace.traceId,
          requestId: trace.requestId,
        },
      },
      { status },
    );
  } finally {
    logApiRouteSummary({
      event: 'music.omr.transcribe.summary',
      route: '/api/music/omr/transcribe',
      method: 'POST',
      status,
      startedAt,
      trace,
    });
  }
}
