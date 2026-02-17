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
        const promptText = typeof body?.promptText === 'string' ? body.promptText.trim() : '';
        const systemPromptInput = typeof body?.systemPrompt === 'string' ? body.systemPrompt.trim() : '';
        const xml = typeof body?.xml === 'string' ? body.xml : '';
        const imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64.trim() : '';
        const imageMediaType = typeof body?.imageMediaType === 'string' ? body.imageMediaType.trim() : 'image/png';
        const pdfBase64 = typeof body?.pdfBase64 === 'string' ? body.pdfBase64.trim() : '';
        const pdfMediaType = typeof body?.pdfMediaType === 'string' ? body.pdfMediaType.trim() : 'application/pdf';
        const pdfFilename = typeof body?.pdfFilename === 'string' ? body.pdfFilename.trim() : 'score-context.pdf';
        const maxTokensRaw = body?.maxTokens;
        const maxTokensValue = Number(maxTokensRaw);
        const maxTokens = Number.isFinite(maxTokensValue) && maxTokensValue > 0 ? maxTokensValue : null;

        if (!apiKey || !model || (!promptText && !prompt)) {
            return NextResponse.json({ error: 'Missing apiKey, model, or prompt/promptText.' }, { status: 400 });
        }

        const systemPrompt = systemPromptInput || 'You are a MusicXML editor. Return only a JSON patch payload (musicxml-patch@1), no markdown or commentary.';
        const userPrompt = promptText || buildPrompt(prompt, xml);
        const hasImage = Boolean(imageBase64);
        const hasPdf = Boolean(pdfBase64);
        const imageDataUrl = hasImage ? `data:${imageMediaType};base64,${imageBase64}` : '';
        const pdfDataUrl = hasPdf ? `data:${pdfMediaType};base64,${pdfBase64}` : '';
        const userContent: Record<string, unknown>[] = [
            { type: 'input_text', text: userPrompt },
        ];
        if (hasImage) {
            userContent.push({ type: 'input_image', image_url: imageDataUrl });
        }
        if (hasPdf) {
            userContent.push({
                type: 'input_file',
                filename: pdfFilename,
                file_data: pdfDataUrl,
            });
        }
        const responseInput: unknown = (hasImage || hasPdf)
            ? [
                {
                    role: 'user',
                    content: userContent,
                },
            ]
            : userPrompt;

        const responsePayload: Record<string, unknown> = {
            model,
            instructions: systemPrompt,
            input: responseInput,
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
            if (hasPdf) {
                return NextResponse.json({ error: errorText || 'OpenAI request failed.' }, { status: response.status });
            }
            const userMessageContent: unknown = hasImage
                ? [
                    { type: 'text', text: userPrompt },
                    {
                        type: 'image_url',
                        image_url: {
                            url: imageDataUrl,
                        },
                    },
                ]
                : userPrompt;
            // Fallback for legacy chat-only models.
            const fallbackPayload: Record<string, unknown> = {
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessageContent },
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
