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

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0,
                max_tokens: maxTokens,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json({ error: errorText || 'OpenAI request failed.' }, { status: response.status });
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content ?? '';
        return NextResponse.json({ text });
    } catch (err) {
        console.error('OpenAI proxy error', err);
        return NextResponse.json({ error: 'OpenAI proxy error.' }, { status: 500 });
    }
}
