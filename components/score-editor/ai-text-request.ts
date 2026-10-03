import {
  AI_MODEL_CAPABILITY_REGISTRY_VERSION,
  detectUnsupportedAiRequestParameter,
  resolveAiModelDescriptor,
  type OptionalAiRequestParameter,
} from '../../lib/ai-model-capabilities';
import { requestAiTextDirect, type AiProvider } from '../../lib/ai-provider-adapters';
import {
  type AiImageAttachment,
  type AiPdfAttachment,
  type AiSourceRagInfo,
} from './ai-assistant-types';
import {
  AI_PATCH_SYSTEM_PROMPT,
  ANTHROPIC_EMBED_PROXY_ERROR,
  isMissingProxyStatus,
} from './ai-constants';
import { buildPromptWithSections } from './ai-prompts';
import { errorMessage } from './error-messages';
import type { AiModelDescriptor } from '../../lib/ai-model-capabilities/types';
import type { TraceContext } from '../../lib/editor-analytics';
import type { EditorLaunchContext } from '../../lib/editor-launch-context';
import type React from 'react';

export type RequestAiTextContext = {
  aiUnsupportedParametersRef: React.RefObject<Map<string, Set<OptionalAiRequestParameter>>>;
  setAiTemperatureMode: React.Dispatch<React.SetStateAction<'auto' | 'custom'>>;
  setAiMaxTokensMode: React.Dispatch<React.SetStateAction<'auto' | 'custom'>>;
  aiModelDescriptors: AiModelDescriptor[];
  useLlmProxy: boolean;
  activeLaunchContext: EditorLaunchContext | null;
  proxyUrlFor: (path: string) => string;
  captureApiTraceContext: (headers: Headers | null | undefined) => TraceContext;
  isEmbedBuild: boolean;
  llmProxyBase: string;
};

export async function requestAiTextImpl(
  ctx: RequestAiTextContext,
  payload: {
    provider: AiProvider;
    apiKey: string;
    model: string;
    promptText: string;
    systemPrompt?: string;
    prompt?: string;
    xml?: string;
    image?: AiImageAttachment | null;
    pdf?: AiPdfAttachment | null;
    maxTokens: number | null;
    temperature?: number | null;
    enableSourceRag?: boolean;
  },
): Promise<{ text: string; sourceRag: AiSourceRagInfo | null }> {
  const {
    aiUnsupportedParametersRef,
    setAiTemperatureMode,
    setAiMaxTokensMode,
    aiModelDescriptors,
    useLlmProxy,
    activeLaunchContext,
    proxyUrlFor,
    captureApiTraceContext,
    isEmbedBuild,
    llmProxyBase,
  } = ctx;
  const {
    provider,
    apiKey,
    model,
    promptText,
    systemPrompt: systemPromptOverride = '',
    prompt = '',
    xml = '',
    image = null,
    pdf = null,
    maxTokens,
    temperature = null,
    enableSourceRag = false,
  } = payload;
  const systemPrompt = systemPromptOverride.trim() || AI_PATCH_SYSTEM_PROMPT;
  const userPrompt =
    promptText.trim() ||
    buildPromptWithSections(
      prompt,
      xml.trim() ? [{ title: 'Current MusicXML', content: xml }] : [],
    );
  const capabilityCacheKey = `${provider}:${model.trim().replace(/^models\//, '')}`;
  const knownUnsupported =
    aiUnsupportedParametersRef.current.get(capabilityCacheKey) ??
    new Set<OptionalAiRequestParameter>();
  let effectiveMaxTokens = knownUnsupported.has('maxOutputTokens') ? null : maxTokens;
  let effectiveTemperature = knownUnsupported.has('temperature') ? null : temperature;
  const rememberUnsupported = (parameter: OptionalAiRequestParameter) => {
    const next = new Set(aiUnsupportedParametersRef.current.get(capabilityCacheKey) ?? []);
    const isNewObservation = !next.has(parameter);
    next.add(parameter);
    aiUnsupportedParametersRef.current.set(capabilityCacheKey, next);
    if (isNewObservation) {
      console.warn('[AI] Optional model parameter rejected; retrying without it.', {
        provider,
        model,
        parameter,
        registryVersion: AI_MODEL_CAPABILITY_REGISTRY_VERSION,
      });
    }
    if (parameter === 'temperature') {
      effectiveTemperature = null;
      setAiTemperatureMode('auto');
    } else {
      effectiveMaxTokens = null;
      setAiMaxTokensMode('auto');
    }
  };
  const requestDescriptor =
    aiModelDescriptors.find(
      (descriptor) =>
        descriptor.provider === provider && descriptor.id === model.trim().replace(/^models\//, ''),
    ) ?? resolveAiModelDescriptor(provider, model);

  if (useLlmProxy) {
    const requestBody: Record<string, unknown> = {
      apiKey,
      model,
      prompt,
      xml,
      sourceContext: activeLaunchContext || undefined,
      enableSourceRag,
      systemPrompt: systemPrompt || undefined,
      promptText: userPrompt,
      imageBase64: image?.base64 ?? '',
      imageMediaType: image?.mediaType ?? '',
      pdfBase64: pdf?.base64 ?? '',
      pdfMediaType: pdf?.mediaType ?? '',
      pdfFilename: pdf?.filename ?? '',
      maxTokens: effectiveMaxTokens ?? undefined,
      temperature: effectiveTemperature ?? undefined,
    };
    const sendProxyRequest = () =>
      fetch(proxyUrlFor(`/api/llm/${provider}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
    let response = await sendProxyRequest();
    captureApiTraceContext(response.headers);
    let responseErrorText = response.ok ? '' : await response.text();
    const unsupportedParameter = detectUnsupportedAiRequestParameter(responseErrorText);
    const canRetryWithoutParameter =
      unsupportedParameter === 'temperature'
        ? effectiveTemperature != null
        : unsupportedParameter === 'maxOutputTokens' && effectiveMaxTokens != null;
    if (!response.ok && unsupportedParameter && canRetryWithoutParameter) {
      rememberUnsupported(unsupportedParameter);
      delete requestBody[unsupportedParameter === 'temperature' ? 'temperature' : 'maxTokens'];
      response = await sendProxyRequest();
      captureApiTraceContext(response.headers);
      responseErrorText = response.ok ? '' : await response.text();
    }
    if (response.ok) {
      const data = await response.json();
      return {
        text: typeof data?.text === 'string' ? data.text : '',
        sourceRag:
          data &&
          typeof data === 'object' &&
          'sourceRag' in data &&
          data.sourceRag &&
          typeof data.sourceRag === 'object'
            ? (data.sourceRag as AiSourceRagInfo)
            : null,
      };
    }
    if (
      provider === 'anthropic' &&
      isEmbedBuild &&
      !llmProxyBase &&
      isMissingProxyStatus(response.status)
    ) {
      throw new Error(ANTHROPIC_EMBED_PROXY_ERROR);
    }
    const canFallbackDirect =
      provider !== 'anthropic' &&
      isEmbedBuild &&
      !llmProxyBase &&
      isMissingProxyStatus(response.status);
    if (!canFallbackDirect) {
      throw new Error(responseErrorText || 'Request failed.');
    }
  }

  const sendDirectRequest = () =>
    requestAiTextDirect({
      provider,
      apiKey,
      model,
      promptText: userPrompt,
      systemPrompt,
      maxTokens: effectiveMaxTokens,
      temperature: effectiveTemperature,
      modelDescriptor: requestDescriptor,
      image,
      pdf,
    });
  let text: string;
  try {
    text = await sendDirectRequest();
  } catch (err) {
    const unsupportedParameter = detectUnsupportedAiRequestParameter(
      errorMessage(err) || String(err),
    );
    const canRetryWithoutParameter =
      unsupportedParameter === 'temperature'
        ? effectiveTemperature != null
        : unsupportedParameter === 'maxOutputTokens' && effectiveMaxTokens != null;
    if (!unsupportedParameter || !canRetryWithoutParameter) {
      throw err;
    }
    rememberUnsupported(unsupportedParameter);
    text = await sendDirectRequest();
  }
  return { text, sourceRag: null };
}
