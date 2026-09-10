import { NextResponse } from 'next/server';
import { requireSensitiveApiAccess } from '../../../../lib/api-access-control';
import {
  applyTraceHeaders,
  resolveTraceContext,
  withTraceHeaders,
} from '../../../../lib/trace-http';
import { augmentPromptWithSourceRag } from '../_lib/source-rag';
import {
  detectUnsupportedAiRequestParameter,
  getDiscoveredAiModelDescriptor,
  validateAiModelRequest,
} from '../../../../lib/ai-model-capabilities';

export const dynamic = 'force-dynamic';

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

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const parseGeminiText = (data: unknown) => {
  const root = asRecord(data);
  const candidates = Array.isArray(root?.candidates) ? root.candidates : [];
  const firstCandidate = asRecord(candidates[0]);
  const content = asRecord(firstCandidate?.content);
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  return parts
    .map((part) => {
      const partRecord = asRecord(part);
      return typeof partRecord?.text === 'string' ? partRecord.text : '';
    })
    .join('');
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
  const access = requireSensitiveApiAccess({
    request,
    trace,
    route: '/api/llm/gemini',
    allowUnauthenticatedEnvVar: 'ALLOW_UNAUTHENTICATED_LLM_PROXY',
  });
  if (!access.ok) {
    return access.response;
  }
  try {
    const body = await request.json();
    const apiKey = String(body?.apiKey || '').trim();
    const model = String(body?.model || '').trim();
    const prompt = String(body?.prompt || '').trim();
    const promptText = typeof body?.promptText === 'string' ? body.promptText.trim() : '';
    const sourceContext = body?.sourceContext;
    const enableSourceRag = body?.enableSourceRag === true;
    const systemPromptInput =
      typeof body?.systemPrompt === 'string' ? body.systemPrompt.trim() : '';
    const xml = typeof body?.xml === 'string' ? body.xml : '';
    const imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64.trim() : '';
    const imageMediaType =
      typeof body?.imageMediaType === 'string' ? body.imageMediaType.trim() : 'image/png';
    const pdfBase64 = typeof body?.pdfBase64 === 'string' ? body.pdfBase64.trim() : '';
    const pdfMediaType =
      typeof body?.pdfMediaType === 'string' ? body.pdfMediaType.trim() : 'application/pdf';
    const maxTokensRaw = body?.maxTokens;
    const maxTokensValue = Number(maxTokensRaw);
    const maxTokens = Number.isFinite(maxTokensValue) && maxTokensValue > 0 ? maxTokensValue : null;
    // Only send `temperature` when the caller explicitly provides one, so we
    // stay compatible with models that reject a non-default temperature.
    const temperatureRaw = body?.temperature;
    const temperatureNum = Number(temperatureRaw);
    const includeTemperature = temperatureRaw != null && Number.isFinite(temperatureNum);

    if (!apiKey || !model || (!promptText && !prompt)) {
      return tracedJson({ error: 'Missing apiKey, model, or prompt/promptText.' }, { status: 400 });
    }

    const systemPrompt =
      systemPromptInput ||
      'You are a MusicXML editor. Return only a JSON patch payload (musicxml-patch@1), no markdown or commentary.';
    const basePrompt = promptText || buildPrompt(prompt, xml);
    const sourceRagResult = await augmentPromptWithSourceRag({
      sourceContext,
      enableSourceRag,
      promptText: basePrompt,
      prompt,
    });
    const userPrompt = sourceRagResult.promptText || basePrompt;
    const normalizedModel = normalizeGeminiModel(model);
    if (!normalizedModel) {
      return tracedJson({ error: 'Missing model.' }, { status: 400 });
    }
    const capabilityValidation = validateAiModelRequest(
      'gemini',
      model,
      {
        maxTokens,
        temperature: includeTemperature ? temperatureNum : null,
        hasImage: Boolean(imageBase64),
        hasPdf: Boolean(pdfBase64),
      },
      getDiscoveredAiModelDescriptor('gemini', model),
    );
    if (!capabilityValidation.ok) {
      return tracedJson({ error: capabilityValidation.error }, { status: 400 });
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

    const generationConfig: Record<string, unknown> = {};
    if (includeTemperature) {
      generationConfig.temperature = temperatureNum;
    }
    if (maxTokens) {
      generationConfig.maxOutputTokens = maxTokens;
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${normalizedModel}:generateContent`,
      {
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
      },
    );

    if (!response.ok) {
      const providerError = await response.text().catch(() => '');
      const unsupportedParameter = detectUnsupportedAiRequestParameter(providerError);
      return tracedJson(
        {
          error: 'Gemini request failed.',
          providerStatus: response.status,
          ...(unsupportedParameter ? { unsupportedParameter } : {}),
        },
        { status: response.status },
      );
    }

    const data = await response.json();
    const text = parseGeminiText(data);
    return tracedJson({ text, sourceRag: sourceRagResult.sourceRag });
  } catch (err) {
    console.error('Gemini proxy error', err);
    return tracedJson({ error: 'Gemini proxy error.' }, { status: 500 });
  }
}
