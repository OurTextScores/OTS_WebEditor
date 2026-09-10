import { NextResponse } from 'next/server';
import { requireServerCredentialAccess } from '../../../../lib/api-access-control';
import { runMusicGenerateService } from '../../../../lib/music-services/generate-service';
import { applyTraceHeaders, resolveTraceContext } from '../../../../lib/trace-http';

export const runtime = 'nodejs';

const readTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const isSpaceBackend = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === 'huggingface-space' ||
    normalized === 'hf-space' ||
    normalized === 'space' ||
    normalized === 'gradio-space'
  );
};

export async function POST(request: Request) {
  const trace = resolveTraceContext(request);
  const body = await request.json();
  const data = asRecord(body);
  const backend = readTrimmedString(data?.backend || 'huggingface') || 'huggingface';
  const requestHfToken = readTrimmedString(data?.hfToken ?? data?.hf_token);
  if (
    isSpaceBackend(backend) &&
    !requestHfToken &&
    (process.env.MUSIC_NOTAGEN_SPACE_TOKEN || '').trim()
  ) {
    const access = requireServerCredentialAccess({
      request,
      trace,
      route: '/api/music/generate',
    });
    if (!access.ok) {
      return access.response;
    }
  }
  const result = await runMusicGenerateService(body, { traceContext: trace });
  const response = NextResponse.json(result.body, { status: result.status });
  applyTraceHeaders(response.headers, trace);
  return response;
}
