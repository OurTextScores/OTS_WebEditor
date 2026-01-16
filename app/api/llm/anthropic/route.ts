import { NextResponse } from 'next/server';

const buildPrompt = (prompt: string, xml?: string) => {
    if (xml && xml.trim()) {
        return `${prompt}\n\nCurrent MusicXML:\n${xml}\n\nReturn ONLY the updated MusicXML.`;
    }
    return `${prompt}\n\nReturn ONLY the updated MusicXML.`;
};

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const apiKey = String(body?.apiKey || '').trim();
        const model = String(body?.model || '').trim();
        const prompt = String(body?.prompt || '').trim();
        const xml = typeof body?.xml === 'string' ? body.xml : '';
        const maxTokens = Number(body?.maxTokens) || 4096;

        if (!apiKey || !model || !prompt) {
            return NextResponse.json({ error: 'Missing apiKey, model, or prompt.' }, { status: 400 });
        }

        const systemPrompt = 'You are a MusicXML editor. Return only valid MusicXML, no markdown or commentary.';
        const userPrompt = buildPrompt(prompt, xml);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model,
                max_tokens: maxTokens,
                temperature: 0,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json({ error: errorText || 'Anthropic request failed.' }, { status: response.status });
        }

        const data = await response.json();
        const content = Array.isArray(data?.content) ? data.content : [];
        const text = content.map((item: any) => item?.text || '').join('') || '';
        return NextResponse.json({ text });
    } catch (err) {
        console.error('Anthropic proxy error', err);
        return NextResponse.json({ error: 'Anthropic proxy error.' }, { status: 500 });
    }
}
