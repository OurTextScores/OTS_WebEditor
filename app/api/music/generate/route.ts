import { NextResponse } from 'next/server';
import { runMusicGenerateService } from '../../../../lib/music-services/generate-service';
import { applyTraceHeaders, resolveTraceContext } from '../../../../lib/trace-http';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    const trace = resolveTraceContext(request);
    const result = await runMusicGenerateService(await request.json(), { traceContext: trace });
    const response = NextResponse.json(result.body, { status: result.status });
    applyTraceHeaders(response.headers, trace);
    return response;
}
