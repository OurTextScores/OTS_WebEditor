import { AI_PROVIDER_LABELS } from '../../lib/ai-provider-adapters';
import { notifyError, notifyWarning } from '../shell/notices';
import { type AiChatMessage, type AiPromptSection } from './ai-assistant-types';
import {
  AI_CHAT_SYSTEM_PROMPT,
  AI_PAGE_SVG_CONTEXT_MAX_CHARS,
  AI_PDF_ATTACHMENT_MAX_BYTES,
} from './ai-constants';
import {
  buildAiChatTranscript,
  buildPromptWithSections,
  shouldEnableSourceRagForPrompt,
  truncateAiContext,
} from './ai-prompts';
import { errorMessage } from './error-messages';
import type { AiProvider } from '../../lib/ai-provider-adapters';
import type { AiImageAttachment, AiPdfAttachment, AiSourceRagInfo } from './ai-assistant-types';
import type { AiScoreBridge } from './ai-score-bridge';
import type { EditorTelemetryCounters } from './editor-types';
import type React from 'react';

export type SendAiChatContext = {
  aiEnabled: boolean;
  aiApiKey: string;
  aiProvider: AiProvider;
  aiModel: string;
  aiChatInput: string;
  aiMaxTokensMode: 'auto' | 'custom';
  aiMaxTokens: number;
  aiChatMessages: AiChatMessage[];
  setAiChatBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setAiError: React.Dispatch<React.SetStateAction<string | null>>;
  aiIncludeXml: boolean;
  aiScoreBridge: AiScoreBridge;
  aiIncludePdf: boolean;
  aiIncludePage: boolean;
  currentPageRef: React.RefObject<number>;
  aiIncludeSelection: boolean;
  aiIncludeChat: boolean;
  aiIncludeRenderedImage: boolean;
  setAiChatInput: React.Dispatch<React.SetStateAction<string>>;
  setAiChatMessages: React.Dispatch<React.SetStateAction<AiChatMessage[]>>;
  telemetryCountersRef: React.RefObject<EditorTelemetryCounters>;
  requestAiText: (payload: {
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
  }) => Promise<{ text: string; sourceRag: AiSourceRagInfo | null }>;
  aiTemperatureMode: 'auto' | 'custom';
  aiTemperature: number;
  emitEditorTelemetry: (
    eventName: string,
    properties?: Record<string, string | number | boolean | null | undefined>,
    options?: { beacon?: boolean },
  ) => void;
};

export async function sendAiChatMessage(ctx: SendAiChatContext) {
  const {
    aiEnabled,
    aiApiKey,
    aiProvider,
    aiModel,
    aiChatInput,
    aiMaxTokensMode,
    aiMaxTokens,
    aiChatMessages,
    setAiChatBusy,
    setAiError,
    aiIncludeXml,
    aiScoreBridge,
    aiIncludePdf,
    aiIncludePage,
    currentPageRef,
    aiIncludeSelection,
    aiIncludeChat,
    aiIncludeRenderedImage,
    setAiChatInput,
    setAiChatMessages,
    telemetryCountersRef,
    requestAiText,
    aiTemperatureMode,
    aiTemperature,
    emitEditorTelemetry,
  } = ctx;
  if (!aiEnabled) {
    notifyWarning('AI features are disabled.');
    return;
  }
  if (!aiApiKey.trim()) {
    notifyWarning(`Enter your ${AI_PROVIDER_LABELS[aiProvider]} API key.`);
    return;
  }
  if (!aiModel.trim()) {
    notifyWarning('Select a model.');
    return;
  }
  if (!aiChatInput.trim()) {
    notifyWarning('Enter a chat message.');
    return;
  }
  if (aiMaxTokensMode === 'custom' && aiMaxTokens <= 0) {
    notifyWarning('Enter a max output token limit.');
    return;
  }

  const userMessage: AiChatMessage = { role: 'user', text: aiChatInput.trim() };
  const nextMessages = [...aiChatMessages, userMessage];
  const shouldUseSourceRag = shouldEnableSourceRagForPrompt(userMessage.text);

  setAiChatBusy(true);
  setAiError(null);
  const requestStartedAt = Date.now();
  let requestIssued = false;
  let outcome: 'success' | 'failure' = 'failure';
  let failureReason = '';
  try {
    const promptSections: AiPromptSection[] = [];
    const xmlContext = aiIncludeXml ? await aiScoreBridge.getContextXml() : '';
    if (aiIncludeXml && !xmlContext.trim()) {
      notifyError('Unable to load MusicXML for context.');
      return;
    }
    if (aiIncludeXml && xmlContext.trim()) {
      promptSections.push({
        title: 'Current MusicXML text',
        content: xmlContext,
      });
    }
    const pdfAttachment = aiIncludePdf ? await aiScoreBridge.getScorePdf() : null;
    if (aiIncludePdf) {
      promptSections.push({
        title: 'Rendered score PDF',
        content: pdfAttachment
          ? `Attached as ${pdfAttachment.filename}.`
          : `PDF attachment unavailable (or exceeds ${Math.round(AI_PDF_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB limit).`,
      });
    }
    if (aiIncludePage) {
      const pageContextRaw = await aiScoreBridge.getPageSvgContext();
      if (pageContextRaw.trim()) {
        const pageContext = truncateAiContext(pageContextRaw, AI_PAGE_SVG_CONTEXT_MAX_CHARS);
        promptSections.push({
          title: `Current rendered page SVG (page ${Math.max(0, currentPageRef.current) + 1})`,
          content: `${pageContext.value}${
            pageContext.truncated
              ? `\n[Page SVG truncated from ${pageContext.originalLength} characters.]`
              : ''
          }`,
        });
      } else {
        promptSections.push({
          title: `Current rendered page SVG (page ${Math.max(0, currentPageRef.current) + 1})`,
          content: 'Page SVG context is unavailable.',
        });
      }
    }
    if (aiIncludeSelection) {
      const selectionContext = await aiScoreBridge.getSelectionContext();
      promptSections.push({
        title: 'Current selection context',
        content: selectionContext || 'No active selection.',
      });
    }
    if (aiIncludeChat) {
      const chatTranscript = buildAiChatTranscript(nextMessages);
      promptSections.push({
        title: 'Assistant chat history',
        content: chatTranscript || 'No prior chat messages.',
      });
    }
    const imageAttachment = aiIncludeRenderedImage ? await aiScoreBridge.getPageImage() : null;
    if (aiIncludeRenderedImage && !imageAttachment) {
      console.warn('Rendered image context requested, but PNG capture is unavailable.');
    }

    const promptText = buildPromptWithSections(
      `Latest user message:\n${userMessage.text}\n\nRespond directly to the latest user message.`,
      promptSections,
    );
    setAiChatInput('');
    setAiChatMessages(nextMessages);
    const maxTokens = aiMaxTokensMode === 'custom' ? aiMaxTokens : null;
    requestIssued = true;
    telemetryCountersRef.current.aiRequests += 1;
    const result = await requestAiText({
      provider: aiProvider,
      apiKey: aiApiKey,
      model: aiModel,
      promptText,
      systemPrompt: AI_CHAT_SYSTEM_PROMPT,
      prompt: userMessage.text,
      xml: aiIncludeXml ? xmlContext : '',
      image: imageAttachment,
      pdf: pdfAttachment,
      maxTokens,
      temperature: aiTemperatureMode === 'custom' ? aiTemperature : null,
      enableSourceRag: shouldUseSourceRag,
    });
    const responseText = result.text.trim();
    if (!responseText) {
      failureReason = 'No response was returned by the model.';
      setAiError(failureReason);
      return;
    }
    setAiChatMessages((prev) => [
      ...prev,
      { role: 'assistant', text: responseText, sourceRag: result.sourceRag },
    ]);
    outcome = 'success';
  } catch (err) {
    console.error('AI chat request failed', err);
    const message = errorMessage(err);
    failureReason = message || 'AI chat request failed. See console for details.';
    setAiError(failureReason);
  } finally {
    setAiChatBusy(false);
    if (requestIssued) {
      if (outcome === 'failure') {
        telemetryCountersRef.current.aiFailures += 1;
      }
      emitEditorTelemetry('score_editor_ai_request', {
        channel: 'assistant_chat',
        provider: aiProvider,
        model: aiModel,
        outcome,
        duration_ms: Math.max(0, Date.now() - requestStartedAt),
        error: outcome === 'failure' ? failureReason || undefined : undefined,
      });
    }
  }
}
