import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const apiKey = String(body?.apiKey || '').trim();
        if (!apiKey) {
            return NextResponse.json({ error: 'Missing apiKey.' }, { status: 400 });
        }

        const response = await fetch('https://api.openai.com/v1/models', {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json({ error: errorText || 'OpenAI request failed.' }, { status: response.status });
        }

        const data = await response.json();
        const models = Array.isArray(data?.data)
            ? data.data
                  .map((item: any) => item?.id)
                  .filter((id: unknown) => typeof id === 'string')
            : [];
        return NextResponse.json({ models });
    } catch (err) {
        console.error('OpenAI models proxy error', err);
        return NextResponse.json({ error: 'OpenAI models proxy error.' }, { status: 500 });
    }
}
