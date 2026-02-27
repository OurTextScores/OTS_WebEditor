import { NextResponse } from 'next/server';
import { MusicServiceError } from '../../../../lib/music-services/errors';
import { runMusicContextService } from '../../../../lib/music-services/context-service';
import { applyTraceHeaders, resolveTraceContext } from '../../../../lib/trace-http';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    const trace = resolveTraceContext(request);
    const tracedJson = (body: unknown, init?: ResponseInit) => {
        const response = NextResponse.json(body, init);
        applyTraceHeaders(response.headers, trace);
        return response;
    };
    try {
        const result = await runMusicContextService(await request.json());
        return tracedJson(result.body, { status: result.status });
    } catch (error) {
        if (error instanceof MusicServiceError) {
            return tracedJson({ error: error.message }, { status: error.status });
        }
        const message = error instanceof Error ? error.message : 'Music context extraction error.';
        return tracedJson({ error: message }, { status: 500 });
    }
}
