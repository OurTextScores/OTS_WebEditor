import { NextResponse } from 'next/server';
import { requireServerCredentialAccess } from '../../../../lib/api-access-control';
import { runMusicAgentRouter } from '../../../../lib/music-agents/router';
import { applyTraceHeaders, resolveTraceContext } from '../../../../lib/trace-http';

export const runtime = 'nodejs';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const readTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const routeWouldUseServerAiKey = (body: unknown) => {
  const data = asRecord(body);
  if (data?.useFallbackOnly === true) {
    return false;
  }
  const requestApiKey = readTrimmedString(data?.apiKey) || readTrimmedString(data?.api_key);
  if (requestApiKey) {
    return false;
  }
  const provider =
    readTrimmedString(data?.provider).toLowerCase() === 'anthropic' ? 'anthropic' : 'openai';
  return provider === 'anthropic'
    ? Boolean((process.env.ANTHROPIC_API_KEY || '').trim())
    : Boolean((process.env.OPENAI_API_KEY || '').trim());
};

export async function POST(request: Request) {
  const traceContext = resolveTraceContext(request);
  const traceId = traceContext.traceId;
  const detailedTracing = process.env.MUSIC_AGENT_TRACE === '1';
  const startedAt = Date.now();
  const tracedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    applyTraceHeaders(response.headers, traceContext);
    return response;
  };

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const durationMs = Date.now() - startedAt;
    console.info(
      JSON.stringify({
        event: 'music_agent.request.summary',
        traceId,
        requestId: traceContext.requestId,
        sessionId: traceContext.sessionId || null,
        route: '/api/music/agent',
        status: 400,
        durationMs,
        mode: 'invalid-json',
        selectedTool: null,
      }),
    );
    return tracedJson({ error: 'Invalid JSON body.', traceId }, { status: 400 });
  }

  if (routeWouldUseServerAiKey(body)) {
    const access = requireServerCredentialAccess({
      request,
      trace: traceContext,
      route: '/api/music/agent',
    });
    if (!access.ok) {
      return access.response;
    }
  }

  const traceLog = (
    level: 'info' | 'warn' | 'error',
    event: string,
    payload: Record<string, unknown>,
  ) => {
    const serialized = JSON.stringify({
      event,
      route: '/api/music/agent',
      requestId: traceContext.requestId,
      sessionId: traceContext.sessionId || null,
      ...payload,
    });
    if (level === 'error') {
      console.error(serialized);
      return;
    }
    if (level === 'warn') {
      console.warn(serialized);
      return;
    }
    console.info(serialized);
  };

  let result;
  try {
    result = await runMusicAgentRouter(body, {
      trace: {
        traceId,
        traceContext,
        detailed: detailedTracing,
        log: traceLog,
      },
    });
  } catch (error) {
    console.error('Music Agent Router Error:', error);
    result = {
      status: 500,
      body: {
        error: error instanceof Error ? error.message : 'Unknown error in music agent router',
        traceId,
      },
    };
  }

  const durationMs = Date.now() - startedAt;
  const resultBody =
    result.body && typeof result.body === 'object' ? (result.body as Record<string, unknown>) : {};
  console.info(
    JSON.stringify({
      event: 'music_agent.request.summary',
      traceId,
      requestId: traceContext.requestId,
      sessionId: traceContext.sessionId || null,
      route: '/api/music/agent',
      status: result.status,
      durationMs,
      mode: typeof resultBody.mode === 'string' ? resultBody.mode : null,
      selectedTool: typeof resultBody.selectedTool === 'string' ? resultBody.selectedTool : null,
    }),
  );

  return tracedJson(
    {
      ...result.body,
      ...(resultBody.traceId ? {} : { traceId }),
    },
    { status: result.status },
  );
}
