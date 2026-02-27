import { NextResponse } from 'next/server';
import { getScoreArtifact, summarizeScoreArtifact } from '../../../../../lib/score-artifacts';
import { applyTraceHeaders, resolveTraceContext } from '../../../../../lib/trace-http';

export const runtime = 'nodejs';

const asRecord = (value: unknown): Record<string, unknown> | null => (
    value && typeof value === 'object' ? value as Record<string, unknown> : null
);

export async function POST(request: Request) {
    const trace = resolveTraceContext(request);
    const tracedJson = (body: unknown, init?: ResponseInit) => {
        const response = NextResponse.json(body, init);
        applyTraceHeaders(response.headers, trace);
        return response;
    };
    const body = await request.json().catch(() => ({}));
    const data = asRecord(body);
    const id = typeof data?.id === 'string' ? data.id.trim() : '';
    if (!id) {
        return tracedJson({ error: 'Missing artifact id.' }, { status: 400 });
    }

    const artifact = await getScoreArtifact(id);
    if (!artifact) {
        return tracedJson({ error: 'Artifact not found.' }, { status: 404 });
    }

    const includeContent = typeof data?.includeContent === 'boolean'
        ? data.includeContent
        : (typeof data?.include_content === 'boolean' ? data.include_content : false);
    if (includeContent) {
        return tracedJson({ artifact });
    }
    return tracedJson({ artifact: summarizeScoreArtifact(artifact) });
}
