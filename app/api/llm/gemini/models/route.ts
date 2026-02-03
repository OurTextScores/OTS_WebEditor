import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const apiKey = String(body?.apiKey || '').trim();
        if (!apiKey) {
            return NextResponse.json({ error: 'Missing apiKey.' }, { status: 400 });
        }

        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json({ error: errorText || 'Gemini request failed.' }, { status: response.status });
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
        return NextResponse.json({ models });
    } catch (err) {
        console.error('Gemini models proxy error', err);
        return NextResponse.json({ error: 'Gemini models proxy error.' }, { status: 500 });
    }
}
