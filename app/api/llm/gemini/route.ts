import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

const buildPrompt = (prompt: string, xml?: string) => {
    const patchSpec = `Return ONLY valid JSON in the following format:
{
  "format": "musicxml-patch@1",
  "ops": [
    { "op": "replace", "path": "/score-partwise/part[@id='P1']/measure[@number='1']/note[1]", "value": "<note>...</note>" },
    { "op": "setText", "path": "/score-partwise/part[@id='P1']/measure[@number='1']/note[1]/duration", "value": "2" },
    { "op": "setAttr", "path": "/score-partwise/part[@id='P1']/measure[@number='1']/note[1]", "name": "default-x", "value": "123.45" },
    { "op": "insertAfter", "path": "/score-partwise/part[@id='P1']/measure[@number='1']/note[1]", "value": "<note>...</note>" },
    { "op": "delete", "path": "/score-partwise/part[@id='P1']/measure[@number='1']/note[2]" }
  ]
}
Use ONLY these ops: replace, setText, setAttr, insertBefore, insertAfter, delete.
Each XPath must match exactly one node.`;

    if (xml && xml.trim()) {
        return `${prompt}\n\nCurrent MusicXML:\n${xml}\n\n${patchSpec}`;
    }
    return `${prompt}\n\n${patchSpec}`;
};

const parseGeminiText = (data: any) => {
    const parts = data?.candidates?.[0]?.content?.parts;
    return Array.isArray(parts) ? parts.map((part: any) => part?.text || '').join('') : '';
};

const normalizeGeminiModel = (model: string) => {
    const trimmed = model.trim();
    if (!trimmed) {
        return '';
    }
    if (trimmed.includes('/')) {
        return trimmed;
    }
    return `models/${trimmed}`;
};

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const apiKey = String(body?.apiKey || '').trim();
        const model = String(body?.model || '').trim();
        const prompt = String(body?.prompt || '').trim();
        const xml = typeof body?.xml === 'string' ? body.xml : '';
        const maxTokensRaw = body?.maxTokens;
        const maxTokensValue = Number(maxTokensRaw);
        const maxTokens = Number.isFinite(maxTokensValue) && maxTokensValue > 0 ? maxTokensValue : null;

        if (!apiKey || !model || !prompt) {
            return NextResponse.json({ error: 'Missing apiKey, model, or prompt.' }, { status: 400 });
        }

        const systemPrompt = 'You are a MusicXML editor. Return only a JSON patch payload (musicxml-patch@1), no markdown or commentary.';
        const userPrompt = buildPrompt(prompt, xml);
        const normalizedModel = normalizeGeminiModel(model);
        if (!normalizedModel) {
            return NextResponse.json({ error: 'Missing model.' }, { status: 400 });
        }

        const generationConfig: Record<string, unknown> = {
            temperature: 0,
        };
        if (maxTokens) {
            generationConfig.maxOutputTokens = maxTokens;
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${normalizedModel}:generateContent`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{ text: systemPrompt }],
                },
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: userPrompt }],
                    },
                ],
                generationConfig,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json({ error: errorText || 'Gemini request failed.' }, { status: response.status });
        }

        const data = await response.json();
        const text = parseGeminiText(data);
        return NextResponse.json({ text });
    } catch (err) {
        console.error('Gemini proxy error', err);
        return NextResponse.json({ error: 'Gemini proxy error.' }, { status: 500 });
    }
}
