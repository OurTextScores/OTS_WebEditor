import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

const ANTHROPIC_VERSION = '2023-06-01';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const apiKey = String(body?.apiKey || '').trim();
        if (!apiKey) {
            return NextResponse.json({ error: 'Missing apiKey.' }, { status: 400 });
        }

        const response = await fetch('https://api.anthropic.com/v1/models', {
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': ANTHROPIC_VERSION,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json({ error: errorText || 'Anthropic request failed.' }, { status: response.status });
        }

        const data = await response.json();
        const models = Array.isArray(data?.models)
            ? data.models.map((item: any) => item?.id).filter((id: unknown) => typeof id === 'string')
            : Array.isArray(data?.data)
                ? data.data.map((item: any) => item?.id).filter((id: unknown) => typeof id === 'string')
                : [];
        return NextResponse.json({ models });
    } catch (err) {
        console.error('Anthropic models proxy error', err);
        return NextResponse.json({ error: 'Anthropic models proxy error.' }, { status: 500 });
    }
}
