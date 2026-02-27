import { NextResponse } from 'next/server';
import { applyTraceHeaders, resolveTraceContext, withTraceHeaders } from '../../../lib/trace-http';

export type OpenAiCompatibleProvider = 'openai' | 'grok' | 'deepseek' | 'kimi';

type OpenAiCompatibleProviderConfig = {
    label: string;
    baseUrl: string;
    supportsResponsesApi: boolean;
    supportsPdfAttachments: boolean;
};

const DEFAULT_CONFIGS: Record<OpenAiCompatibleProvider, OpenAiCompatibleProviderConfig> = {
    openai: {
        label: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        supportsResponsesApi: true,
        supportsPdfAttachments: true,
    },
    grok: {
        label: 'Grok',
        baseUrl: 'https://api.x.ai/v1',
        supportsResponsesApi: false,
        supportsPdfAttachments: false,
    },
    deepseek: {
        label: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1',
        supportsResponsesApi: false,
        supportsPdfAttachments: false,
    },
    kimi: {
        label: 'Kimi',
        baseUrl: 'https://api.moonshot.ai/v1',
        supportsResponsesApi: false,
        supportsPdfAttachments: false,
    },
};

const getConfig = (provider: OpenAiCompatibleProvider): OpenAiCompatibleProviderConfig => {
    const base = DEFAULT_CONFIGS[provider];
    const envKey = `LLM_${provider.toUpperCase()}_API_BASE_URL`;
    const envBase = (process.env[envKey] || '').trim().replace(/\/+$/, '');
    if (!envBase) {
        return base;
    }
    return {
        ...base,
        baseUrl: envBase,
    };
};

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

const asRecord = (value: unknown): Record<string, unknown> | null => (
    value && typeof value === 'object' ? value as Record<string, unknown> : null
);

const parseChatCompletionsText = (data: unknown) => {
    const root = asRecord(data);
    const choices = Array.isArray(root?.choices) ? root.choices : [];
    const firstChoice = asRecord(choices[0]);
    const message = asRecord(firstChoice?.message);
    const content = message?.content;
    if (typeof content === 'string') {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .map((part) => {
                const record = asRecord(part);
                return typeof record?.text === 'string' ? record.text : '';
            })
            .join('');
    }
    return '';
};

const parseResponsesText = (data: unknown) => {
    const root = asRecord(data);
    if (typeof root?.output_text === 'string') {
        return root.output_text;
    }
    const output = Array.isArray(root?.output) ? root.output : [];
    for (const item of output) {
        const itemRecord = asRecord(item);
        if (itemRecord?.type === 'message') {
            const content = Array.isArray(itemRecord.content) ? itemRecord.content : [];
            return content
                .map((part) => {
                    const record = asRecord(part);
                    return typeof record?.text === 'string' ? record.text : '';
                })
                .join('');
        }
    }
    return '';
};

type NormalizedRequest = {
    apiKey: string;
    model: string;
    prompt: string;
    promptText: string;
    systemPrompt: string;
    xml: string;
    imageBase64: string;
    imageMediaType: string;
    pdfBase64: string;
    pdfMediaType: string;
    pdfFilename: string;
    maxTokens: number | null;
};

const parseRequestBody = (body: unknown): NormalizedRequest => {
    const data = asRecord(body);
    const apiKey = String(data?.apiKey || '').trim();
    const model = String(data?.model || '').trim();
    const prompt = String(data?.prompt || '').trim();
    const promptText = typeof data?.promptText === 'string' ? data.promptText.trim() : '';
    const systemPromptInput = typeof data?.systemPrompt === 'string' ? data.systemPrompt.trim() : '';
    const xml = typeof data?.xml === 'string' ? data.xml : '';
    const imageBase64 = typeof data?.imageBase64 === 'string' ? data.imageBase64.trim() : '';
    const imageMediaType = typeof data?.imageMediaType === 'string' ? data.imageMediaType.trim() : 'image/png';
    const pdfBase64 = typeof data?.pdfBase64 === 'string' ? data.pdfBase64.trim() : '';
    const pdfMediaType = typeof data?.pdfMediaType === 'string' ? data.pdfMediaType.trim() : 'application/pdf';
    const pdfFilename = typeof data?.pdfFilename === 'string' ? data.pdfFilename.trim() : 'score-context.pdf';
    const maxTokensValue = Number(data?.maxTokens);
    const maxTokens = Number.isFinite(maxTokensValue) && maxTokensValue > 0 ? maxTokensValue : null;
    const systemPrompt = systemPromptInput || 'You are a MusicXML editor. Return only a JSON patch payload (musicxml-patch@1), no markdown or commentary.';

    return {
        apiKey,
        model,
        prompt,
        promptText,
        systemPrompt,
        xml,
        imageBase64,
        imageMediaType,
        pdfBase64,
        pdfMediaType,
        pdfFilename,
        maxTokens,
    };
};

const buildChatCompletionsPayload = (args: {
    model: string;
    systemPrompt: string;
    userPrompt: string;
    imageBase64: string;
    imageMediaType: string;
    maxTokens: number | null;
}) => {
    const { model, systemPrompt, userPrompt, imageBase64, imageMediaType, maxTokens } = args;
    const hasImage = Boolean(imageBase64);
    const userMessageContent: unknown = hasImage
        ? [
            { type: 'text', text: userPrompt },
            {
                type: 'image_url',
                image_url: {
                    url: `data:${imageMediaType};base64,${imageBase64}`,
                },
            },
        ]
        : userPrompt;

    const payload: Record<string, unknown> = {
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessageContent },
        ],
        temperature: 0,
    };
    if (maxTokens) {
        payload.max_tokens = maxTokens;
    }
    return payload;
};

export async function handleOpenAiCompatibleRequest(provider: OpenAiCompatibleProvider, request: Request) {
    const config = getConfig(provider);
    const trace = resolveTraceContext(request);
    const tracedJson = (body: unknown, init?: ResponseInit) => {
        const response = NextResponse.json(body, init);
        applyTraceHeaders(response.headers, trace);
        return response;
    };
    try {
        const body = await request.json();
        const normalized = parseRequestBody(body);
        const {
            apiKey,
            model,
            prompt,
            promptText,
            systemPrompt,
            xml,
            imageBase64,
            imageMediaType,
            pdfBase64,
            pdfMediaType,
            pdfFilename,
            maxTokens,
        } = normalized;

        if (!apiKey || !model || (!promptText && !prompt)) {
            return tracedJson({ error: 'Missing apiKey, model, or prompt/promptText.' }, { status: 400 });
        }

        const userPrompt = promptText || buildPrompt(prompt, xml);
        const hasImage = Boolean(imageBase64);
        const hasPdf = Boolean(pdfBase64);
        if (hasPdf && !config.supportsPdfAttachments) {
            return tracedJson({ error: `${config.label} proxy does not support PDF attachments yet.` }, { status: 400 });
        }

        if (config.supportsResponsesApi) {
            const userContent: Record<string, unknown>[] = [{ type: 'input_text', text: userPrompt }];
            if (hasImage) {
                userContent.push({ type: 'input_image', image_url: `data:${imageMediaType};base64,${imageBase64}` });
            }
            if (hasPdf) {
                userContent.push({
                    type: 'input_file',
                    filename: pdfFilename,
                    file_data: `data:${pdfMediaType};base64,${pdfBase64}`,
                });
            }
            const responseInput: unknown = (hasImage || hasPdf)
                ? [{ role: 'user', content: userContent }]
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

            const response = await fetch(`${config.baseUrl}/responses`, {
                method: 'POST',
                headers: withTraceHeaders(trace, {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                }),
                body: JSON.stringify(responsePayload),
            });

            if (response.ok) {
                const data = await response.json();
                return tracedJson({ text: parseResponsesText(data) });
            }

            const errorText = await response.text();
            if (hasPdf) {
                return tracedJson({ error: errorText || `${config.label} request failed.` }, { status: response.status });
            }
        }

        const chatPayload = buildChatCompletionsPayload({
            model,
            systemPrompt,
            userPrompt,
            imageBase64,
            imageMediaType,
            maxTokens,
        });
        const chatResponse = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: withTraceHeaders(trace, {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            }),
            body: JSON.stringify(chatPayload),
        });

        if (!chatResponse.ok) {
            const errorText = await chatResponse.text();
            return tracedJson({ error: errorText || `${config.label} request failed.` }, { status: chatResponse.status });
        }

        const chatData = await chatResponse.json();
        return tracedJson({ text: parseChatCompletionsText(chatData) });
    } catch (err) {
        console.error(`${config.label} proxy error`, err);
        return tracedJson({ error: `${config.label} proxy error.` }, { status: 500 });
    }
}

export async function handleOpenAiCompatibleModelsRequest(provider: OpenAiCompatibleProvider, request: Request) {
    const config = getConfig(provider);
    const trace = resolveTraceContext(request);
    const tracedJson = (body: unknown, init?: ResponseInit) => {
        const response = NextResponse.json(body, init);
        applyTraceHeaders(response.headers, trace);
        return response;
    };
    try {
        const body = await request.json();
        const apiKey = String(body?.apiKey || '').trim();
        if (!apiKey) {
            return tracedJson({ error: 'Missing apiKey.' }, { status: 400 });
        }

        const response = await fetch(`${config.baseUrl}/models`, {
            headers: withTraceHeaders(trace, {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return tracedJson({ error: errorText || `${config.label} request failed.` }, { status: response.status });
        }

        const data = await response.json();
        const models = Array.isArray(data?.data)
            ? data.data.map((item: unknown) => {
                const record = asRecord(item);
                return record?.id;
            }).filter((id: unknown): id is string => typeof id === 'string')
            : Array.isArray(data?.models)
                ? data.models.map((item: unknown) => {
                    const record = asRecord(item);
                    return record?.id ?? item;
                }).filter((id: unknown): id is string => typeof id === 'string')
                : [];
        return tracedJson({ models });
    } catch (err) {
        console.error(`${config.label} models proxy error`, err);
        return tracedJson({ error: `${config.label} models proxy error.` }, { status: 500 });
    }
}
