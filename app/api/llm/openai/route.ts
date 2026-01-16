import { NextResponse } from 'next/server';

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

const parseChatCompletions = (data: any) => data?.choices?.[0]?.message?.content ?? '';

const parseResponsesText = (data: any) => {
    if (typeof data?.output_text === 'string') {
        return data.output_text;
    }
    const output = Array.isArray(data?.output) ? data.output : [];
    for (const item of output) {
        if (item?.type === 'message') {
            const content = Array.isArray(item?.content) ? item.content : [];
            return content.map((part: any) => part?.text || '').join('');
        }
    }
    return '';
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

        const responsePayload: Record<string, unknown> = {
            model,
            instructions: systemPrompt,
            input: userPrompt,
            temperature: 0,
        };
        if (maxTokens) {
            responsePayload.max_output_tokens = maxTokens;
        }

        const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(responsePayload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            // Fallback for legacy chat-only models.
            const fallbackPayload: Record<string, unknown> = {
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0,
            };
            if (maxTokens) {
                fallbackPayload.max_tokens = maxTokens;
            }
            const fallbackResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(fallbackPayload),
            });

            if (!fallbackResponse.ok) {
                const fallbackError = await fallbackResponse.text();
                return NextResponse.json({ error: fallbackError || errorText || 'OpenAI request failed.' }, { status: fallbackResponse.status });
            }

            const fallbackData = await fallbackResponse.json();
            const text = parseChatCompletions(fallbackData);
            return NextResponse.json({ text });
        }

        const data = await response.json();
        const text = parseResponsesText(data);
        return NextResponse.json({ text });
    } catch (err) {
        console.error('OpenAI proxy error', err);
        return NextResponse.json({ error: 'OpenAI proxy error.' }, { status: 500 });
    }
}
