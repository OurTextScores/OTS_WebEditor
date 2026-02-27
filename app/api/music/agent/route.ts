import { NextResponse } from 'next/server';
import { runMusicAgentRouter } from '../../../../lib/music-agents/router';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const traceId = request.headers.get('x-request-id') || crypto.randomUUID();
  const detailedTracing = process.env.MUSIC_AGENT_TRACE === '1';
  const startedAt = Date.now();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const durationMs = Date.now() - startedAt;
    console.info(JSON.stringify({
      event: 'music_agent.request.summary',
      traceId,
      route: '/api/music/agent',
      status: 400,
      durationMs,
      mode: 'invalid-json',
      selectedTool: null,
    }));
    return NextResponse.json(
      { error: 'Invalid JSON body.', traceId },
      { status: 400, headers: { 'x-trace-id': traceId } },
    );
  }

  const traceLog = (level: 'info' | 'warn' | 'error', event: string, payload: Record<string, unknown>) => {
    const serialized = JSON.stringify({
      event,
      route: '/api/music/agent',
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

  const result = await runMusicAgentRouter(body, {
    trace: {
      traceId,
      detailed: detailedTracing,
      log: traceLog,
    },
  });

  const durationMs = Date.now() - startedAt;
  const resultBody = (result.body && typeof result.body === 'object') ? result.body as Record<string, unknown> : {};
  console.info(JSON.stringify({
    event: 'music_agent.request.summary',
    traceId,
    route: '/api/music/agent',
    status: result.status,
    durationMs,
    mode: typeof resultBody.mode === 'string' ? resultBody.mode : null,
    selectedTool: typeof resultBody.selectedTool === 'string' ? resultBody.selectedTool : null,
  }));

  return NextResponse.json(
    {
      ...result.body,
      ...(resultBody.traceId ? {} : { traceId }),
    },
    {
      status: result.status,
      headers: {
        'x-trace-id': traceId,
      },
    },
  );
}
