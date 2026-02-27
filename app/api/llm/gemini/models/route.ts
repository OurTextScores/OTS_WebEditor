import { NextResponse } from 'next/server';
import { applyTraceHeaders, resolveTraceContext, withTraceHeaders } from '../../../../../lib/trace-http';

export const dynamic = 'force-static';

export async function POST(request: Request) {
    const trace = resolveTraceContext(request);
    const tracedJson = (body: unknown, init?: ResponseInit) => {
        const response = NextResponse.json(body, init);
        applyTraceHeaders(response.headers, trace);
        return response;
    };
    try {
        const body = await request.json();
        const apiKey = String(body?.apiKey || '').trim();
        if (!apiKey) {
            return tracedJson({ error: 'Missing apiKey.' }, { status: 400 });
        }

        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
            headers: withTraceHeaders(trace, {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return tracedJson({ error: errorText || 'Gemini request failed.' }, { status: response.status });
        }

        const data = await response.json();
        const rawModels = Array.isArray(data?.models) ? data.models : [];
        const ids: string[] = [];
        for (const item of rawModels) {
            if (typeof item?.baseModelId === 'string') {
                ids.push(item.baseModelId);
            }
            if (typeof item?.name === 'string') {
                ids.push(String(item.name).replace(/^models\//, ''));
            }
        }
        const models = ids.filter((id) => typeof id === 'string');
        return tracedJson({ models });
    } catch (err) {
        console.error('Gemini models proxy error', err);
        return tracedJson({ error: 'Gemini models proxy error.' }, { status: 500 });
    }
}
