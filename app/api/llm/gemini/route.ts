import { NextResponse } from 'next/server';
import { applyTraceHeaders, resolveTraceContext, withTraceHeaders } from '../../../../lib/trace-http';

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
    const trace = resolveTraceContext(request);
    const tracedJson = (body: unknown, init?: ResponseInit) => {
        const response = NextResponse.json(body, init);
        applyTraceHeaders(response.headers, trace);
        return response;
    };
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
        const maxTokensRaw = body?.maxTokens;
        const maxTokensValue = Number(maxTokensRaw);
        const maxTokens = Number.isFinite(maxTokensValue) && maxTokensValue > 0 ? maxTokensValue : null;

        if (!apiKey || !model || (!promptText && !prompt)) {
            return tracedJson({ error: 'Missing apiKey, model, or prompt/promptText.' }, { status: 400 });
        }

        const systemPrompt = systemPromptInput || 'You are a MusicXML editor. Return only a JSON patch payload (musicxml-patch@1), no markdown or commentary.';
        const userPrompt = promptText || buildPrompt(prompt, xml);
        const normalizedModel = normalizeGeminiModel(model);
        if (!normalizedModel) {
            return tracedJson({ error: 'Missing model.' }, { status: 400 });
        }
        const parts: Array<Record<string, unknown>> = [{ text: userPrompt }];
        if (imageBase64) {
            parts.push({
                inlineData: {
                    mimeType: imageMediaType,
                    data: imageBase64,
                },
            });
        }
        if (pdfBase64) {
            parts.push({
                inlineData: {
                    mimeType: pdfMediaType,
                    data: pdfBase64,
                },
            });
        }

        const generationConfig: Record<string, unknown> = {
            temperature: 0,
        };
        if (maxTokens) {
            generationConfig.maxOutputTokens = maxTokens;
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${normalizedModel}:generateContent`, {
            method: 'POST',
            headers: withTraceHeaders(trace, {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            }),
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{ text: systemPrompt }],
                },
                contents: [
                    {
                        role: 'user',
                        parts,
                    },
                ],
                generationConfig,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return tracedJson({ error: errorText || 'Gemini request failed.' }, { status: response.status });
        }

        const data = await response.json();
        const text = parseGeminiText(data);
        return tracedJson({ text });
    } catch (err) {
        console.error('Gemini proxy error', err);
        return tracedJson({ error: 'Gemini proxy error.' }, { status: 500 });
    }
}
