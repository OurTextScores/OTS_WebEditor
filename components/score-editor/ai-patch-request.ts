import { AI_EDIT_EFFORT_PROFILES } from '../../lib/ai-edit-effort';
import { readAiEditServiceResponse } from '../../lib/ai-edit-progress-client';
import { findAiEditProposal } from '../../lib/ai-edit-proposal';
import { AI_PROVIDER_LABELS } from '../../lib/ai-provider-adapters';
import { asRecord } from '../../lib/as-record';
import { extractPatchAnnotations } from '../../lib/patch-annotations';
import { createClientProposalSession } from '../../lib/proposal-session-client';
import { resolveScoreEditorApiPath } from '../../lib/score-editor-api-client';
import { notifyError, notifyWarning } from '../shell/notices';
import { type AiPromptSection } from './ai-assistant-types';
import { AI_PAGE_SVG_CONTEXT_MAX_CHARS, AI_PDF_ATTACHMENT_MAX_BYTES } from './ai-constants';
import { buildAiChatTranscript, buildAiPrompt, truncateAiContext } from './ai-prompts';
import { errorMessage } from './error-messages';
import { parseMusicXmlPatch } from './musicxml';
import type { AiEditProgressUpdate } from '../../lib/ai-edit-progress';
import type { AiEditProposal } from '../../lib/ai-edit-proposal';
import type { AiProvider } from '../../lib/ai-provider-adapters';
import type { TraceContext } from '../../lib/editor-analytics';
import type { PatchAnnotation } from '../../lib/patch-annotations';
import type { ClientProposalSession } from '../../lib/proposal-session-client';
import type { AiChatMessage, MusicXmlPatch } from './ai-assistant-types';
import type { AiScoreBridge } from './ai-score-bridge';
import type { EditorTelemetryCounters } from './editor-types';
import type { AiEditRequestHandle, AiEditWorkKind } from './useAiEditController';
import type React from 'react';

export type RequestAiPatchContext = {
  aiEnabled: boolean;
  aiBusy: boolean;
  aiDiffFeedbackBusy: boolean;
  aiApiKey: string;
  aiProvider: AiProvider;
  aiPrompt: string;
  aiModel: string;
  aiMaxTokensMode: 'auto' | 'custom';
  aiMaxTokens: number;
  beginAiEdit: (kind: AiEditWorkKind, message: string) => AiEditRequestHandle;
  aiDeepEdit: boolean;
  setAiError: React.Dispatch<React.SetStateAction<string | null>>;
  setAiOutput: React.Dispatch<React.SetStateAction<string>>;
  setAiPatch: React.Dispatch<React.SetStateAction<MusicXmlPatch | null>>;
  setAiPatchError: React.Dispatch<React.SetStateAction<string | null>>;
  setAiPatchedXml: React.Dispatch<React.SetStateAction<string>>;
  clearAiProposal: () => void;
  aiScoreBridge: AiScoreBridge;
  xmlText: string;
  aiIncludeXml: boolean;
  aiIncludePdf: boolean;
  aiIncludePage: boolean;
  currentPageRef: React.RefObject<number>;
  aiIncludeSelection: boolean;
  aiIncludeChat: boolean;
  aiChatMessages: AiChatMessage[];
  aiIncludeRenderedImage: boolean;
  setAiBaseXml: React.Dispatch<React.SetStateAction<string>>;
  telemetryCountersRef: React.RefObject<EditorTelemetryCounters>;
  aiEditEffort: 'efficient' | 'balanced' | 'thorough';
  aiTemperatureMode: 'auto' | 'custom';
  aiTemperature: number;
  captureApiTraceContext: (headers: Headers | null | undefined) => TraceContext;
  updateAiEditProgress: (handle: AiEditRequestHandle, update: AiEditProgressUpdate) => void;
  setAiLastAnnotations: React.Dispatch<React.SetStateAction<PatchAnnotation[]>>;
  openAiProposalCompare: (
    baseXml: string,
    proposedXml: string,
    proposal?: Pick<AiEditProposal, 'expectedCurrentContentHash' | 'expectedCurrentIdentityHash'>,
  ) => boolean;
  mergeAiAnnotations: (annotations: PatchAnnotation[] | undefined | null) => void;
  setAiProposalSession: (session: ClientProposalSession | null) => void;
  setAiProposalAudit: React.Dispatch<React.SetStateAction<Record<string, unknown> | null>>;
  finishAiEdit: (
    handle: AiEditRequestHandle,
    outcome: 'success' | 'failure' | 'cancelled',
    message?: string,
  ) => void;
  emitEditorTelemetry: (
    eventName: string,
    properties?: Record<string, string | number | boolean | null | undefined>,
    options?: { beacon?: boolean },
  ) => void;
};

export async function requestAiPatch(ctx: RequestAiPatchContext) {
  const {
    aiEnabled,
    aiBusy,
    aiDiffFeedbackBusy,
    aiApiKey,
    aiProvider,
    aiPrompt,
    aiModel,
    aiMaxTokensMode,
    aiMaxTokens,
    beginAiEdit,
    aiDeepEdit,
    setAiError,
    setAiOutput,
    setAiPatch,
    setAiPatchError,
    setAiPatchedXml,
    clearAiProposal,
    aiScoreBridge,
    xmlText,
    aiIncludeXml,
    aiIncludePdf,
    aiIncludePage,
    currentPageRef,
    aiIncludeSelection,
    aiIncludeChat,
    aiChatMessages,
    aiIncludeRenderedImage,
    setAiBaseXml,
    telemetryCountersRef,
    aiEditEffort,
    aiTemperatureMode,
    aiTemperature,
    captureApiTraceContext,
    updateAiEditProgress,
    setAiLastAnnotations,
    openAiProposalCompare,
    mergeAiAnnotations,
    setAiProposalSession,
    setAiProposalAudit,
    finishAiEdit,
    emitEditorTelemetry,
  } = ctx;
  if (!aiEnabled) {
    notifyWarning('AI features are disabled.');
    return;
  }
  if (aiBusy || aiDiffFeedbackBusy) {
    return;
  }
  if (!aiApiKey.trim()) {
    notifyWarning(`Enter your ${AI_PROVIDER_LABELS[aiProvider]} API key.`);
    return;
  }
  if (!aiPrompt.trim()) {
    notifyWarning('Enter an instruction for the assistant.');
    return;
  }
  if (!aiModel.trim()) {
    notifyWarning('Select a model.');
    return;
  }
  if (aiMaxTokensMode === 'custom' && aiMaxTokens <= 0) {
    notifyWarning('Enter a max output token limit.');
    return;
  }
  const editRequest = beginAiEdit(
    aiDeepEdit ? 'deep' : 'patch',
    aiDeepEdit ? 'Preparing Deep Edit' : 'Preparing patch request',
  );
  const requestController = editRequest.controller;
  let clientTimeoutId: ReturnType<typeof setTimeout> | null = null;
  setAiError(null);
  setAiOutput('');
  setAiPatch(null);
  setAiPatchError(null);
  setAiPatchedXml('');
  clearAiProposal();
  const requestStartedAt = Date.now();
  let requestIssued = false;
  let outcome: 'success' | 'failure' | 'cancelled' = 'failure';
  let failureReason = '';
  try {
    const promptSections: AiPromptSection[] = [];
    // Proposal identity and later Apply/feedback gates must use the same live
    // webmscore serialization. The XML sidebar can briefly retain the source
    // representation after a new score is loaded.
    const baseXml = (await aiScoreBridge.getLiveXml(xmlText || null)) || '';
    if (!baseXml.trim()) {
      failureReason = 'Unable to load MusicXML for patch verification.';
      setAiError(failureReason);
      return;
    }
    const xmlContext = aiIncludeXml ? baseXml : '';
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
      const chatTranscript = buildAiChatTranscript(aiChatMessages);
      promptSections.push({
        title: 'Assistant chat history',
        content: chatTranscript || 'No prior chat messages.',
      });
    }
    const imageAttachment = aiIncludeRenderedImage ? await aiScoreBridge.getPageImage() : null;
    if (aiIncludeRenderedImage && !imageAttachment) {
      console.warn('Rendered image context requested, but PNG capture is unavailable.');
    }
    setAiBaseXml(baseXml);
    const maxTokens = aiMaxTokensMode === 'custom' ? aiMaxTokens : null;
    const promptText = buildAiPrompt(aiPrompt, promptSections);
    if (requestController.signal.aborted) {
      throw requestController.signal.reason;
    }
    requestIssued = true;
    telemetryCountersRef.current.aiRequests += 1;
    // Deep Edit is a separate, more expensive endpoint; it does not take
    // image/PDF context in v1.
    const patchEndpoint = aiDeepEdit ? '/api/music/patch/deep' : '/api/music/patch';
    const requestBudgetMs = aiDeepEdit
      ? AI_EDIT_EFFORT_PROFILES[aiEditEffort].deep.budgetMs
      : AI_EDIT_EFFORT_PROFILES[aiEditEffort].patch.budgetMs;
    clientTimeoutId = setTimeout(() => {
      requestController.abort(new DOMException('AI edit request timed out.', 'TimeoutError'));
    }, requestBudgetMs + 30_000);
    const response = await fetch(resolveScoreEditorApiPath(patchEndpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      signal: requestController.signal,
      body: JSON.stringify({
        content: baseXml,
        promptText,
        provider: aiProvider,
        apiKey: aiApiKey.trim(),
        model: aiModel.trim(),
        editEffort: aiEditEffort,
        ...(aiDeepEdit
          ? {}
          : {
              image: imageAttachment,
              pdf: pdfAttachment,
              maxTokens,
              temperature: aiTemperatureMode === 'custom' ? aiTemperature : null,
            }),
      }),
    });
    captureApiTraceContext(response.headers);
    const serviceResponse = await readAiEditServiceResponse(response, (update) =>
      updateAiEditProgress(editRequest, update),
    );
    const result = asRecord(serviceResponse.body) || {};
    if (serviceResponse.status >= 400) {
      const message =
        typeof result.error === 'string'
          ? result.error
          : `Patch request failed: ${serviceResponse.status}`;
      throw new Error(message);
    }

    const verification = asRecord(result.verification);
    const verificationLevel = typeof verification?.level === 'string' ? verification.level : '';
    const verifiedLevels = ['patch_apply', 'engine_load', 'render'];
    if (!verifiedLevels.includes(verificationLevel)) {
      throw new Error('Patch service returned an unverified proposal.');
    }
    const patchPayload = asRecord(result.patch);
    const parsedPatch = patchPayload
      ? parseMusicXmlPatch(JSON.stringify(patchPayload))
      : { patch: null, error: '' };
    if (patchPayload && (parsedPatch.error || !parsedPatch.patch)) {
      throw new Error(parsedPatch.error || 'Patch service returned an invalid patch payload.');
    }
    if (!parsedPatch.patch && !aiDeepEdit) {
      throw new Error('Patch service returned an invalid patch payload.');
    }
    const proposedXml = typeof result.proposedXml === 'string' ? result.proposedXml.trim() : '';
    if (!proposedXml) {
      throw new Error('Patch service returned empty proposed MusicXML.');
    }

    const annotations = extractPatchAnnotations({ annotations: result.annotations });
    const deepEditAudit = asRecord(result.deepEdit);
    if (parsedPatch.patch) {
      setAiOutput(
        JSON.stringify(
          {
            ...parsedPatch.patch,
            ...(annotations.length ? { annotations } : {}),
          },
          null,
          2,
        ),
      );
    } else {
      setAiOutput(
        JSON.stringify(
          {
            deepEdit: {
              finalizedCandidateId: deepEditAudit?.finalizedCandidateId ?? null,
              rationale: deepEditAudit?.rationale ?? '',
            },
          },
          null,
          2,
        ),
      );
    }
    setAiPatch(parsedPatch.patch);
    setAiPatchError(null);
    setAiPatchedXml(proposedXml);
    setAiLastAnnotations(annotations);
    const serviceProposal = findAiEditProposal(result);
    const proposalBaseXml = serviceProposal?.baseXml || baseXml;
    const proposalXml = serviceProposal?.proposedXml || proposedXml;
    if (!openAiProposalCompare(proposalBaseXml, proposalXml, serviceProposal || undefined)) {
      failureReason = 'Unable to open compare view for AI proposal.';
      setAiError(failureReason);
      return;
    }
    // openAiProposalCompare resets threads, so seed the assistant annotations after it.
    mergeAiAnnotations(annotations);
    setAiProposalSession(
      createClientProposalSession({
        id: typeof result.proposalSessionId === 'string' ? result.proposalSessionId : null,
        originalInstruction: aiPrompt.trim(),
        includeChat: aiIncludeChat,
        proposal: serviceProposal,
        patch: parsedPatch.patch,
        annotations,
        continuityToken: result.continuityToken,
      }),
    );
    setAiProposalAudit({
      cycle: 1,
      verification: result.verification,
      ...(deepEditAudit ? { deepEdit: deepEditAudit } : {}),
    });
    outcome = 'success';
  } catch (err) {
    console.error('AI request failed', err);
    const abortReason = requestController.signal.aborted ? requestController.signal.reason : null;
    const wasCancelled = abortReason instanceof DOMException && abortReason.name === 'AbortError';
    const timedOut = abortReason instanceof DOMException && abortReason.name === 'TimeoutError';
    if (wasCancelled) {
      outcome = 'cancelled';
    }
    const message = wasCancelled
      ? 'Request cancelled.'
      : timedOut
        ? 'AI edit request exceeded its client timeout.'
        : errorMessage(err);
    failureReason = message || 'AI request failed. See console for details.';
    setAiError(wasCancelled ? null : message || 'AI request failed. See console for details.');
  } finally {
    if (clientTimeoutId) {
      clearTimeout(clientTimeoutId);
    }
    finishAiEdit(editRequest, outcome, failureReason);
    if (requestIssued) {
      if (outcome === 'failure') {
        telemetryCountersRef.current.aiFailures += 1;
      }
      emitEditorTelemetry('score_editor_ai_request', {
        channel: 'assistant_patch',
        provider: aiProvider,
        model: aiModel,
        edit_effort: aiEditEffort,
        outcome,
        duration_ms: Math.max(0, Date.now() - requestStartedAt),
        error: outcome === 'failure' ? failureReason || undefined : undefined,
      });
    }
  }
}
