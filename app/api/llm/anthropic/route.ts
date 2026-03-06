import { NextResponse } from 'next/server';
import { applyTraceHeaders, resolveTraceContext, withTraceHeaders } from '../../../../lib/trace-http';
import { augmentPromptWithSourceRag } from '../_lib/source-rag';

export const dynamic = 'force-static';

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 2048;

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

const parseAnthropicText = (data: any) => {
    const content = Array.isArray(data?.content) ? data.content : [];
    return content.map((part: any) => (part?.type === 'text' ? part?.text || '' : '')).join('');
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
        const sourceContext = body?.sourceContext;
        const enableSourceRag = body?.enableSourceRag === true;
        const systemPromptInput = typeof body?.systemPrompt === 'string' ? body.systemPrompt.trim() : '';
        const xml = typeof body?.xml === 'string' ? body.xml : '';
        const imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64.trim() : '';
        const imageMediaType = typeof body?.imageMediaType === 'string' ? body.imageMediaType.trim() : 'image/png';
        const pdfBase64 = typeof body?.pdfBase64 === 'string' ? body.pdfBase64.trim() : '';
        const pdfMediaType = typeof body?.pdfMediaType === 'string' ? body.pdfMediaType.trim() : 'application/pdf';
        const maxTokensRaw = body?.maxTokens;
        const maxTokensValue = Number(maxTokensRaw);
        const maxTokens = Number.isFinite(maxTokensValue) && maxTokensValue > 0 ? maxTokensValue : DEFAULT_MAX_TOKENS;

        if (!apiKey || !model || (!promptText && !prompt)) {
            return tracedJson({ error: 'Missing apiKey, model, or prompt/promptText.' }, { status: 400 });
        }

        const systemPrompt = systemPromptInput || 'You are a MusicXML editor. Return only a JSON patch payload (musicxml-patch@1), no markdown or commentary.';
        const basePrompt = promptText || buildPrompt(prompt, xml);
        const sourceRagResult = await augmentPromptWithSourceRag({
            sourceContext,
            enableSourceRag,
            promptText: basePrompt,
            prompt,
        });
        const userPrompt = sourceRagResult.promptText || basePrompt;
        const userContent: Array<Record<string, unknown>> = [
            { type: 'text', text: userPrompt },
        ];
        if (imageBase64) {
            userContent.push({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: imageMediaType,
                    data: imageBase64,
                },
            });
        }
        if (pdfBase64) {
            userContent.push({
                type: 'document',
                source: {
                    type: 'base64',
                    media_type: pdfMediaType,
                    data: pdfBase64,
                },
            });
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: withTraceHeaders(trace, {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': ANTHROPIC_VERSION,
            }),
            body: JSON.stringify({
                model,
                max_tokens: maxTokens,
                temperature: 0,
                system: systemPrompt,
                messages: [
                    { role: 'user', content: userContent },
                ],
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return tracedJson({ error: errorText || 'Anthropic request failed.' }, { status: response.status });
        }

        const data = await response.json();
        const text = parseAnthropicText(data);
        return tracedJson({ text, sourceRag: sourceRagResult.sourceRag });
    } catch (err) {
        console.error('Anthropic proxy error', err);
        return tracedJson({ error: 'Anthropic proxy error.' }, { status: 500 });
    }
}
