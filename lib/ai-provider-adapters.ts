import {
  buildAiModelDescriptorsFromProviderResponse,
  type AiModelDescriptor,
  validateAiModelRequest,
} from './ai-model-capabilities';

export type AiProvider = 'openai' | 'anthropic' | 'gemini' | 'grok' | 'deepseek' | 'kimi';
export type OpenAiCompatibleAiProvider = 'openai' | 'grok' | 'deepseek' | 'kimi';
export type AiProviderKind = 'openai-compatible' | 'anthropic' | 'gemini';

export type AiProviderCapabilities = {
  supportsPdfContext: boolean;
  supportsRenderedImageContext: boolean;
};

export type AiProviderConfig = {
  kind: AiProviderKind;
  label: string;
  defaultModel: string;
  defaultMaxTokens: number;
  apiKeyUrl?: string;
  supportsPdfContext: boolean;
  supportsRenderedImageContext: boolean;
  modelHint?: {
    pattern: RegExp;
    message: string;
  };
  directApiBaseUrl?: string;
  supportsResponsesApi?: boolean;
};

const ANTHROPIC_VERSION = '2023-06-01';

export const AI_PROVIDER_CONFIGS: Record<AiProvider, AiProviderConfig> = {
  openai: {
    kind: 'openai-compatible',
    label: 'OpenAI (ChatGPT)',
    defaultModel: 'gpt-5.5',
    defaultMaxTokens: 2048,
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    supportsPdfContext: true,
    supportsRenderedImageContext: true,
    modelHint: {
      pattern: /^gpt-|^o/,
      message: 'OpenAI model names usually start with gpt- or o- (still allowed).',
    },
    directApiBaseUrl: (process.env.NEXT_PUBLIC_OPENAI_API_BASE_URL || 'https://api.openai.com/v1')
      .trim()
      .replace(/\/+$/, ''),
    supportsResponsesApi: true,
  },
  anthropic: {
    kind: 'anthropic',
    label: 'Anthropic (Claude)',
    defaultModel: 'claude-opus-4-8',
    defaultMaxTokens: 2048,
    apiKeyUrl: 'https://platform.claude.com/settings/keys',
    supportsPdfContext: true,
    supportsRenderedImageContext: true,
    modelHint: {
      pattern: /^claude-/,
      message: 'Claude model names usually start with claude- (still allowed).',
    },
  },
  gemini: {
    kind: 'gemini',
    label: 'Google (Gemini)',
    defaultModel: 'gemini-2.5-pro',
    defaultMaxTokens: 2048,
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    supportsPdfContext: true,
    supportsRenderedImageContext: true,
    modelHint: {
      pattern: /^gemini-|.+\/.+/,
      message: 'Gemini models usually start with gemini- (still allowed).',
    },
  },
  grok: {
    kind: 'openai-compatible',
    label: 'xAI (Grok)',
    defaultModel: 'grok-4.3',
    defaultMaxTokens: 2048,
    apiKeyUrl: 'https://console.x.ai/home',
    supportsPdfContext: false,
    supportsRenderedImageContext: true,
    modelHint: {
      pattern: /^grok-/,
      message: 'Grok model names usually start with grok- (still allowed).',
    },
    directApiBaseUrl: (process.env.NEXT_PUBLIC_GROK_API_BASE_URL || 'https://api.x.ai/v1')
      .trim()
      .replace(/\/+$/, ''),
    supportsResponsesApi: false,
  },
  deepseek: {
    kind: 'openai-compatible',
    label: 'DeepSeek (DeepSeek)',
    defaultModel: 'deepseek-v4-pro',
    defaultMaxTokens: 2048,
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    supportsPdfContext: false,
    supportsRenderedImageContext: true,
    modelHint: {
      pattern: /^deepseek-/,
      message: 'DeepSeek model names usually start with deepseek- (still allowed).',
    },
    directApiBaseUrl: (
      process.env.NEXT_PUBLIC_DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com/v1'
    )
      .trim()
      .replace(/\/+$/, ''),
    supportsResponsesApi: false,
  },
  kimi: {
    kind: 'openai-compatible',
    label: 'Moonshot (Kimi)',
    defaultModel: 'kimi-k2.6',
    defaultMaxTokens: 2048,
    apiKeyUrl: 'https://platform.moonshot.ai/console/api-keys',
    supportsPdfContext: false,
    supportsRenderedImageContext: true,
    modelHint: {
      pattern: /^kimi-/,
      message: 'Kimi model names usually start with kimi- (still allowed).',
    },
    directApiBaseUrl: (process.env.NEXT_PUBLIC_KIMI_API_BASE_URL || 'https://api.moonshot.ai/v1')
      .trim()
      .replace(/\/+$/, ''),
    supportsResponsesApi: false,
  },
};

export const AI_PROVIDER_LABELS = Object.fromEntries(
  (Object.entries(AI_PROVIDER_CONFIGS) as Array<[AiProvider, AiProviderConfig]>).map(
    ([provider, config]) => [provider, config.label],
  ),
) as Record<AiProvider, string>;

export const DEFAULT_MODEL_BY_PROVIDER = Object.fromEntries(
  (Object.entries(AI_PROVIDER_CONFIGS) as Array<[AiProvider, AiProviderConfig]>).map(
    ([provider, config]) => [provider, config.defaultModel],
  ),
) as Record<AiProvider, string>;

export const DEFAULT_MAX_TOKENS_BY_PROVIDER = Object.fromEntries(
  (Object.entries(AI_PROVIDER_CONFIGS) as Array<[AiProvider, AiProviderConfig]>).map(
    ([provider, config]) => [provider, config.defaultMaxTokens],
  ),
) as Record<AiProvider, number>;

export const AI_PROVIDER_CAPABILITIES = Object.fromEntries(
  (Object.entries(AI_PROVIDER_CONFIGS) as Array<[AiProvider, AiProviderConfig]>).map(
    ([provider, config]) => [
      provider,
      {
        supportsPdfContext: config.supportsPdfContext,
        supportsRenderedImageContext: config.supportsRenderedImageContext,
      } satisfies AiProviderCapabilities,
    ],
  ),
) as Record<AiProvider, AiProviderCapabilities>;

export const OPENAI_COMPATIBLE_PROVIDERS = new Set<OpenAiCompatibleAiProvider>(
  (Object.entries(AI_PROVIDER_CONFIGS) as Array<[AiProvider, AiProviderConfig]>)
    .filter(([, config]) => config.kind === 'openai-compatible')
    .map(([provider]) => provider as OpenAiCompatibleAiProvider),
);

export const OPENAI_COMPATIBLE_PROVIDER_SUPPORTS_RESPONSES_API = Object.fromEntries(
  (Object.entries(AI_PROVIDER_CONFIGS) as Array<[AiProvider, AiProviderConfig]>)
    .filter(([, config]) => config.kind === 'openai-compatible')
    .map(([provider, config]) => [provider, Boolean(config.supportsResponsesApi)]),
) as Record<OpenAiCompatibleAiProvider, boolean>;

export const OPENAI_COMPATIBLE_PROVIDER_SUPPORTS_PDF = Object.fromEntries(
  (Object.entries(AI_PROVIDER_CONFIGS) as Array<[AiProvider, AiProviderConfig]>)
    .filter(([, config]) => config.kind === 'openai-compatible')
    .map(([provider, config]) => [provider, config.supportsPdfContext]),
) as Record<OpenAiCompatibleAiProvider, boolean>;

export const OPENAI_COMPATIBLE_PROVIDER_BASE_URL = Object.fromEntries(
  (Object.entries(AI_PROVIDER_CONFIGS) as Array<[AiProvider, AiProviderConfig]>)
    .filter(([, config]) => config.kind === 'openai-compatible')
    .map(([provider, config]) => [provider, config.directApiBaseUrl || '']),
) as Record<OpenAiCompatibleAiProvider, string>;

export const isOpenAiCompatibleProvider = (
  provider: AiProvider,
): provider is OpenAiCompatibleAiProvider =>
  OPENAI_COMPATIBLE_PROVIDERS.has(provider as OpenAiCompatibleAiProvider);

export type TextImageAttachment = {
  mediaType: string;
  base64: string;
};

export type TextPdfAttachment = {
  mediaType: string;
  base64: string;
  filename?: string;
};

export type RequestAiTextDirectArgs = {
  provider: AiProvider;
  apiKey: string;
  model: string;
  promptText: string;
  systemPrompt: string;
  maxTokens: number | null;
  temperature?: number | null;
  modelDescriptor?: AiModelDescriptor | null;
  image?: TextImageAttachment | null;
  pdf?: TextPdfAttachment | null;
  signal?: AbortSignal;
  onRequest?: () => void;
};

export type LoadAiModelsDirectArgs = {
  provider: AiProvider;
  apiKey: string;
  signal?: AbortSignal;
};

export class AiProviderRequestError extends Error {
  readonly requestStarted: boolean;
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(
    message: string,
    options: {
      requestStarted: boolean;
      retryable: boolean;
      status?: number | null;
      cause?: unknown;
    },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AiProviderRequestError';
    this.requestStarted = options.requestStarted;
    this.retryable = options.retryable;
    this.status = options.status ?? null;
  }
}

const isRetryableProviderStatus = (status: number) =>
  status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;

const providerErrorSummary = (value: string) => {
  let summary = value;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const error =
      parsed?.error && typeof parsed.error === 'object'
        ? (parsed.error as Record<string, unknown>)
        : null;
    summary =
      typeof error?.message === 'string'
        ? error.message
        : typeof parsed?.message === 'string'
          ? parsed.message
          : value;
  } catch {
    // Provider errors are not consistently JSON.
  }
  return summary
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1_000);
};

const responseRequestError = (response: Response, message: string) =>
  new AiProviderRequestError(providerErrorSummary(message), {
    requestStarted: true,
    retryable: isRetryableProviderStatus(response.status),
    status: response.status,
  });

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const parseOpenAiResponsesText = (data: unknown) => {
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

const parseOpenAiChatCompletionsText = (data: unknown) => {
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

const parseAnthropicText = (data: unknown) => {
  const root = asRecord(data);
  const content = Array.isArray(root?.content) ? root.content : [];
  return content
    .map((part) => {
      const record = asRecord(part);
      return record?.type === 'text' && typeof record?.text === 'string' ? record.text : '';
    })
    .join('');
};

const parseGeminiText = (data: unknown) => {
  const root = asRecord(data);
  const candidates = Array.isArray(root?.candidates) ? root.candidates : [];
  const firstCandidate = asRecord(candidates[0]);
  const content = asRecord(firstCandidate?.content);
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  return parts
    .map((part) => {
      const record = asRecord(part);
      return typeof record?.text === 'string' ? record.text : '';
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

export async function loadAiModelDescriptorsDirect({
  provider,
  apiKey,
  signal,
}: LoadAiModelsDirectArgs): Promise<AiModelDescriptor[]> {
  if (!apiKey.trim()) {
    return [];
  }
  if (isOpenAiCompatibleProvider(provider)) {
    const baseUrl = OPENAI_COMPATIBLE_PROVIDER_BASE_URL[provider];
    const fetchModels = (path: string) =>
      fetch(`${baseUrl}${path}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal,
      });
    let response =
      provider === 'grok' ? await fetchModels('/language-models') : await fetchModels('/models');
    if (provider === 'grok' && !response.ok) {
      await response.text().catch(() => '');
      response = await fetchModels('/models');
    }
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to load models.');
    }
    const data = await response.json();
    return buildAiModelDescriptorsFromProviderResponse(provider, data);
  }

  if (provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'Content-Type': 'application/json',
      },
      signal,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to load models.');
    }
    const data = await response.json();
    const normalizedData =
      Array.isArray(data?.models) && !Array.isArray(data?.data) ? { data: data.models } : data;
    return buildAiModelDescriptorsFromProviderResponse(provider, normalizedData);
  }

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    signal,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to load models.');
  }
  const data = await response.json();
  return buildAiModelDescriptorsFromProviderResponse(provider, data);
}

export async function loadAiModelsDirect(args: LoadAiModelsDirectArgs): Promise<string[]> {
  const descriptors = await loadAiModelDescriptorsDirect(args);
  return descriptors.map((descriptor) => descriptor.id);
}

export async function requestAiTextDirect({
  provider,
  apiKey,
  model,
  promptText,
  systemPrompt,
  maxTokens,
  temperature = null,
  modelDescriptor = null,
  image = null,
  pdf = null,
  signal,
  onRequest,
}: RequestAiTextDirectArgs): Promise<string> {
  const hasImage = Boolean(image?.base64);
  const hasPdf = Boolean(pdf?.base64);
  // Only send `temperature` when a caller explicitly provides one; newer models
  // (opus-4-8, gpt-5.x) reject a non-default temperature.
  const temperatureNum = Number(temperature);
  const includeTemperature = temperature != null && Number.isFinite(temperatureNum);
  const capabilityValidation = validateAiModelRequest(
    provider,
    model,
    {
      maxTokens,
      temperature: includeTemperature ? temperatureNum : null,
      hasImage,
      hasPdf,
    },
    modelDescriptor,
  );
  if (!capabilityValidation.ok) {
    throw new AiProviderRequestError(
      capabilityValidation.error || `Unsupported request options for ${model}.`,
      { requestStarted: false, retryable: false },
    );
  }
  const imageDataUrl = hasImage ? `data:${image!.mediaType};base64,${image!.base64}` : '';
  const pdfDataUrl = hasPdf ? `data:${pdf!.mediaType};base64,${pdf!.base64}` : '';
  let requestStarted = false;
  const startRequest = () => {
    onRequest?.();
    requestStarted = true;
  };

  try {
    if (isOpenAiCompatibleProvider(provider)) {
      const providerLabel = AI_PROVIDER_LABELS[provider];
      const providerBaseUrl = OPENAI_COMPATIBLE_PROVIDER_BASE_URL[provider];
      if (hasPdf && !OPENAI_COMPATIBLE_PROVIDER_SUPPORTS_PDF[provider]) {
        throw new AiProviderRequestError(
          `${providerLabel} does not support PDF attachments in this integration yet. Disable PDF context or use OpenAI/Claude/Gemini.`,
          { requestStarted: false, retryable: false },
        );
      }

      if (OPENAI_COMPATIBLE_PROVIDER_SUPPORTS_RESPONSES_API[provider]) {
        const userContent: Record<string, unknown>[] = [{ type: 'input_text', text: promptText }];
        if (hasImage) {
          userContent.push({ type: 'input_image', image_url: imageDataUrl });
        }
        if (hasPdf) {
          userContent.push({
            type: 'input_file',
            filename: pdf?.filename || 'score-context.pdf',
            file_data: pdfDataUrl,
          });
        }
        const responseInput: unknown =
          hasImage || hasPdf ? [{ role: 'user', content: userContent }] : promptText;
        const responsePayload: Record<string, unknown> = {
          model,
          instructions: systemPrompt,
          input: responseInput,
          ...(includeTemperature ? { temperature: temperatureNum } : {}),
        };
        if (maxTokens) {
          responsePayload.max_output_tokens = maxTokens;
        }
        startRequest();
        const response = await fetch(`${providerBaseUrl}/responses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(responsePayload),
          signal,
        });
        if (response.ok) {
          const data = await response.json();
          return parseOpenAiResponsesText(data);
        }
        const errorText = await response.text();
        if (hasPdf) {
          throw responseRequestError(response, errorText || `${providerLabel} request failed.`);
        }

        const userMessageContent: unknown = hasImage
          ? [
              { type: 'text', text: promptText },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ]
          : promptText;
        const fallbackPayload: Record<string, unknown> = {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessageContent },
          ],
          ...(includeTemperature ? { temperature: temperatureNum } : {}),
        };
        if (maxTokens) {
          fallbackPayload.max_tokens = maxTokens;
        }
        startRequest();
        const fallbackResponse = await fetch(`${providerBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(fallbackPayload),
          signal,
        });
        if (!fallbackResponse.ok) {
          const fallbackError = await fallbackResponse.text();
          const responsesDetail = providerErrorSummary(
            errorText || `${providerLabel} request failed.`,
          );
          const fallbackDetail = providerErrorSummary(
            fallbackError || `${providerLabel} request failed.`,
          );
          throw responseRequestError(
            fallbackResponse,
            `Responses API HTTP ${response.status}: ${responsesDetail}; Chat Completions fallback HTTP ${fallbackResponse.status}: ${fallbackDetail}`,
          );
        }
        const fallbackData = await fallbackResponse.json();
        return parseOpenAiChatCompletionsText(fallbackData);
      }

      const userMessageContent: unknown = hasImage
        ? [
            { type: 'text', text: promptText },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ]
        : promptText;
      const payload: Record<string, unknown> = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessageContent },
        ],
        ...(includeTemperature ? { temperature: temperatureNum } : {}),
      };
      if (maxTokens) {
        payload[provider === 'kimi' ? 'max_completion_tokens' : 'max_tokens'] = maxTokens;
      }
      startRequest();
      const response = await fetch(`${providerBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal,
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw responseRequestError(response, errorText || `${providerLabel} request failed.`);
      }
      const data = await response.json();
      return parseOpenAiChatCompletionsText(data);
    }

    if (provider === 'anthropic') {
      const anthropicContent: Array<Record<string, unknown>> = [{ type: 'text', text: promptText }];
      if (hasImage) {
        anthropicContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: image!.mediaType,
            data: image!.base64,
          },
        });
      }
      if (hasPdf) {
        anthropicContent.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: pdf!.mediaType,
            data: pdf!.base64,
          },
        });
      }
      startRequest();
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS_BY_PROVIDER.anthropic,
          ...(includeTemperature ? { temperature: temperatureNum } : {}),
          system: systemPrompt,
          messages: [{ role: 'user', content: anthropicContent }],
        }),
        signal,
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw responseRequestError(response, errorText || 'Anthropic request failed.');
      }
      const data = await response.json();
      return parseAnthropicText(data);
    }

    const normalizedModel = normalizeGeminiModel(model);
    if (!normalizedModel) {
      throw new AiProviderRequestError('Missing Gemini model.', {
        requestStarted: false,
        retryable: false,
      });
    }
    const geminiPayload: Record<string, unknown> = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptText },
            ...(hasImage
              ? [
                  {
                    inlineData: {
                      mimeType: image!.mediaType,
                      data: image!.base64,
                    },
                  },
                ]
              : []),
            ...(hasPdf
              ? [
                  {
                    inlineData: {
                      mimeType: pdf!.mediaType,
                      data: pdf!.base64,
                    },
                  },
                ]
              : []),
          ],
        },
      ],
      generationConfig: {
        ...(includeTemperature ? { temperature: temperatureNum } : {}),
      },
    };
    if (maxTokens) {
      (geminiPayload.generationConfig as Record<string, unknown>).maxOutputTokens = maxTokens;
    }
    startRequest();
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${normalizedModel}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(geminiPayload),
        signal,
      },
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw responseRequestError(response, errorText || 'Gemini request failed.');
    }
    const data = await response.json();
    return parseGeminiText(data);
  } catch (error) {
    if (error instanceof AiProviderRequestError) {
      throw error;
    }
    throw new AiProviderRequestError(
      error instanceof Error ? error.message : String(error || 'AI provider request failed.'),
      { requestStarted, retryable: requestStarted, cause: error },
    );
  }
}
