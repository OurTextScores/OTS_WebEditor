import { readAiEditServiceResponse } from '../../lib/ai-edit-progress-client';
import { findAiEditProposal } from '../../lib/ai-edit-proposal';
import { AI_PROVIDER_LABELS } from '../../lib/ai-provider-adapters';
import { asRecord } from '../../lib/as-record';
import {
  buildCompareUserEditDiff,
  type CompareUserEditDiff,
} from '../../lib/compare-user-edit-diff';
import { extractPatchAnnotations, type PatchAnnotation } from '../../lib/patch-annotations';
import {
  advanceClientProposalSession,
  buildProposalSessionRequestPayload,
  createClientProposalSession,
  type ClientProposalSession,
} from '../../lib/proposal-session-client';
import { resolveScoreEditorApiPath } from '../../lib/score-editor-api-client';
import { notifyWarning } from '../shell/notices';
import { formatAiDiffFeedbackError } from './ai-prompts';
import { getReviewStatusForFeedback } from './block-review-status';
import { type BlockReviewStatus } from './compare/compare-types';
import { errorMessage } from './error-messages';
import { applyMusicXmlPatch, parseMusicXmlPatch } from './musicxml';
import type { AiEditProgressUpdate } from '../../lib/ai-edit-progress';
import type { AiProvider } from '../../lib/ai-provider-adapters';
import type { CompareScoreRole } from '../../lib/compare-user-edit-diff';
import type { TraceContext } from '../../lib/editor-analytics';
import type { Score } from '../../lib/webmscore-loader';
import type { AiChatMessage, MusicXmlPatch } from './ai-assistant-types';
import type { AiScoreBridge } from './ai-score-bridge';
import type { AiToolsTab } from './ai-tools/aiToolsTab';
import type { AiMeasureThread } from './compare/CompareMeasureComments';
import type { AiDiffBlockRef, BlockReview, CompareViewState } from './compare/compare-types';
import type { CompareEditCycleSnapshot } from './compare/useCompareEditing';
import type { AiEditRequestHandle, AiEditWorkKind } from './useAiEditController';
import type { AiProposalContinuitySnapshot, AiProposalIdentity } from './useAiProposalController';
import type React from 'react';

export type SendDiffFeedbackContext = {
  compareView: CompareViewState | null;
  isAiCompareMode: boolean;
  aiBusy: boolean;
  aiDiffFeedbackBusy: boolean;
  isCompareEditBusy: () => boolean;
  hasPendingCompareOperations: () => boolean;
  aiApiKey: string;
  aiProvider: AiProvider;
  aiModel: string;
  aiDiffReviews: BlockReview[];
  aiDiffCurrentBlocks: {
    partIndex: number;
    blockIndex: number;
    blockKey: string;
    measureRange: string;
    contentSignature: string;
  }[];
  resolveAiDiffReview: (block: AiDiffBlockRef) => BlockReview | undefined;
  aiMeasureThreads: Record<string, AiMeasureThread>;
  aiScoreBridge: AiScoreBridge;
  setAiError: React.Dispatch<React.SetStateAction<string | null>>;
  setAiDiffFeedbackError: React.Dispatch<React.SetStateAction<string | null>>;
  setCompareRightError: React.Dispatch<React.SetStateAction<string | null>>;
  getScoreMusicXmlText: (
    targetScore: Score | null,
    fallbackXml: string | null,
  ) => Promise<string | null>;
  compareRightScore: Score | null;
  compareEditedRoles: CompareScoreRole[];
  getCompareEditBaseline: (role: CompareScoreRole) => string | null;
  aiDiffGlobalComment: string;
  snapshotAiProposalContinuity: () => AiProposalContinuitySnapshot;
  captureCompareEditCycle: () => CompareEditCycleSnapshot;
  beginAiEdit: (kind: AiEditWorkKind, message: string) => AiEditRequestHandle;
  setAiPatchError: React.Dispatch<React.SetStateAction<string | null>>;
  setXmlSidebarTab: React.Dispatch<React.SetStateAction<AiToolsTab>>;
  setXmlSidebarMode: React.Dispatch<React.SetStateAction<'open' | 'closed'>>;
  invalidateCompareOperations: (invalidateQueuedKeyboard?: boolean) => number;
  setCompareView: React.Dispatch<React.SetStateAction<CompareViewState | null>>;
  setCompareRightLoading: React.Dispatch<React.SetStateAction<boolean>>;
  getAiProposalSession: () => ClientProposalSession | null;
  aiDiffIteration: number;
  aiPrompt: string;
  aiIncludeChat: boolean;
  setAiProposalSession: (session: ClientProposalSession | null) => void;
  getAiProposalExpectedHashes: () => { contentHash: string | null; identityHash: string | null };
  aiEditEffort: 'efficient' | 'balanced' | 'thorough';
  aiMaxTokensMode: 'auto' | 'custom';
  aiMaxTokens: number;
  aiTemperatureMode: 'auto' | 'custom';
  aiTemperature: number;
  aiChatMessages: AiChatMessage[];
  captureApiTraceContext: (headers: Headers | null | undefined) => TraceContext;
  updateAiEditProgress: (handle: AiEditRequestHandle, update: AiEditProgressUpdate) => void;
  setAiOutput: React.Dispatch<React.SetStateAction<string>>;
  setAiPatch: React.Dispatch<React.SetStateAction<MusicXmlPatch | null>>;
  setAiPatchedXml: React.Dispatch<React.SetStateAction<string>>;
  setAiBaseXml: React.Dispatch<React.SetStateAction<string>>;
  clearCompareEditCycle: () => void;
  setCompareSwapped: React.Dispatch<React.SetStateAction<boolean>>;
  captureAiProposal: (proposal: AiProposalIdentity | null | undefined, baseXml: string) => void;
  setAiDiffIteration: React.Dispatch<React.SetStateAction<number>>;
  setAiDiffReviews: React.Dispatch<React.SetStateAction<BlockReview[]>>;
  setAiDiffGlobalComment: React.Dispatch<React.SetStateAction<string>>;
  setAiDiffBlockErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setAiProposalAudit: React.Dispatch<React.SetStateAction<Record<string, unknown> | null>>;
  mergeAiAnnotations: (annotations: PatchAnnotation[] | undefined | null) => void;
  setCompareAlignmentRevision: React.Dispatch<React.SetStateAction<number>>;
  restoreCompareEditCycle: (snapshot: CompareEditCycleSnapshot) => void;
  restoreAiProposalContinuity: (value: AiProposalContinuitySnapshot) => void;
  finishAiEdit: (
    handle: AiEditRequestHandle,
    outcome: 'success' | 'failure' | 'cancelled',
    message?: string,
  ) => void;
};

export type UpdateAiOutputContext = {
  setAiOutput: React.Dispatch<React.SetStateAction<string>>;
  setAiPatch: React.Dispatch<React.SetStateAction<MusicXmlPatch | null>>;
  setAiPatchError: React.Dispatch<React.SetStateAction<string | null>>;
  setAiPatchedXml: React.Dispatch<React.SetStateAction<string>>;
  setAiLastAnnotations: React.Dispatch<React.SetStateAction<PatchAnnotation[]>>;
  aiBaseXml: string;
  aiScoreBridge: AiScoreBridge;
};

export async function sendDiffFeedback(ctx: SendDiffFeedbackContext) {
  const {
    compareView,
    isAiCompareMode,
    aiBusy,
    aiDiffFeedbackBusy,
    isCompareEditBusy,
    hasPendingCompareOperations,
    aiApiKey,
    aiProvider,
    aiModel,
    aiDiffReviews,
    aiDiffCurrentBlocks,
    resolveAiDiffReview,
    aiMeasureThreads,
    aiScoreBridge,
    setAiError,
    setAiDiffFeedbackError,
    setCompareRightError,
    getScoreMusicXmlText,
    compareRightScore,
    compareEditedRoles,
    getCompareEditBaseline,
    aiDiffGlobalComment,
    snapshotAiProposalContinuity,
    captureCompareEditCycle,
    beginAiEdit,
    setAiPatchError,
    setXmlSidebarTab,
    setXmlSidebarMode,
    invalidateCompareOperations,
    setCompareView,
    setCompareRightLoading,
    getAiProposalSession,
    aiDiffIteration,
    aiPrompt,
    aiIncludeChat,
    setAiProposalSession,
    getAiProposalExpectedHashes,
    aiEditEffort,
    aiMaxTokensMode,
    aiMaxTokens,
    aiTemperatureMode,
    aiTemperature,
    aiChatMessages,
    captureApiTraceContext,
    updateAiEditProgress,
    setAiOutput,
    setAiPatch,
    setAiPatchedXml,
    setAiBaseXml,
    clearCompareEditCycle,
    setCompareSwapped,
    captureAiProposal,
    setAiDiffIteration,
    setAiDiffReviews,
    setAiDiffGlobalComment,
    setAiDiffBlockErrors,
    setAiProposalAudit,
    mergeAiAnnotations,
    setCompareAlignmentRevision,
    restoreCompareEditCycle,
    restoreAiProposalContinuity,
    finishAiEdit,
  } = ctx;
  if (
    !compareView ||
    !isAiCompareMode ||
    aiBusy ||
    aiDiffFeedbackBusy ||
    isCompareEditBusy() ||
    hasPendingCompareOperations()
  ) {
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

  const acceptedReviews = aiDiffReviews.filter(
    (review) => getReviewStatusForFeedback(review) === 'accepted',
  );
  const blockMap = new Map<
    string,
    {
      partIndex: number;
      measureRange: string;
      status: BlockReviewStatus;
      comment?: string;
    }
  >();
  acceptedReviews.forEach((review) => {
    blockMap.set(review.blockKey, {
      partIndex: review.partIndex,
      measureRange: review.measureRange,
      status: review.status,
      comment: review.comment,
    });
  });
  aiDiffCurrentBlocks.forEach((block) => {
    const review = resolveAiDiffReview(block);
    const status = getReviewStatusForFeedback(review);
    blockMap.set(block.blockKey, {
      partIndex: block.partIndex,
      measureRange: block.measureRange,
      status,
      comment: review?.comment ?? '',
    });
  });
  const feedbackEntries = Array.from(blockMap.entries()).map(([blockKey, block]) => ({
    blockKey,
    ...block,
  }));
  const feedbackBlocks = feedbackEntries.map((block) => ({
    partIndex: block.partIndex,
    measureRange: block.measureRange,
    status: block.status,
    ...(block.status === 'comment' ? { comment: (block.comment || '').trim() } : {}),
  }));
  // Fold measure-level thread notes into the feedback as per-measure comment blocks so
  // the model sees them on the next regeneration.
  const threadFeedbackBlocks = Object.values(aiMeasureThreads)
    .map((thread) => {
      const userText = thread.comments
        .filter((entry) => entry.author === 'you')
        .map((entry) => entry.text.trim())
        .filter(Boolean)
        .join('\n');
      return userText
        ? {
            partIndex: thread.partIndex,
            measureRange: String(thread.measureNumber),
            status: 'comment' as const,
            comment: userText,
          }
        : null;
    })
    .filter(
      (
        block,
      ): block is {
        partIndex: number;
        measureRange: string;
        status: 'comment';
        comment: string;
      } => block !== null,
    );
  const allFeedbackBlocks = [...feedbackBlocks, ...threadFeedbackBlocks];
  const commentBlockKeys = feedbackEntries
    .filter((block) => block.status === 'comment')
    .map((block) => block.blockKey);

  const currentXml = await aiScoreBridge.getLiveXml(compareView.currentXml);
  if (!currentXml?.trim()) {
    const message = 'Unable to export the current score for feedback.';
    setAiError(message);
    setAiDiffFeedbackError(message);
    setCompareRightError(message);
    return;
  }
  const proposalXml =
    (await getScoreMusicXmlText(compareRightScore, compareView.checkpointXml)) ||
    compareView.checkpointXml;
  const userEditDiffs = compareEditedRoles
    .map((role): CompareUserEditDiff | null => {
      const beforeXml = getCompareEditBaseline(role);
      const afterXml = role === 'current' ? currentXml : proposalXml;
      if (!beforeXml) {
        return null;
      }
      const label = role === 'current' ? 'Current score' : 'Assistant proposal';
      const diff = buildCompareUserEditDiff(beforeXml, afterXml, label);
      return diff ? { side: role, label, diff } : null;
    })
    .filter((edit): edit is CompareUserEditDiff => edit !== null);
  if (!allFeedbackBlocks.length && !aiDiffGlobalComment.trim() && !userEditDiffs.length) {
    return;
  }
  const previousCheckpointXml = compareView.checkpointXml;
  const previousContinuity = snapshotAiProposalContinuity();
  const previousEditCycle = captureCompareEditCycle();
  const editRequest = beginAiEdit('feedback', 'Preparing feedback context');
  const requestController = editRequest.controller;
  let requestOutcome: 'success' | 'failure' | 'cancelled' = 'failure';
  setAiError(null);
  setAiPatchError(null);
  setAiDiffFeedbackError(null);
  setXmlSidebarTab('assistant');
  setXmlSidebarMode((prev) => (prev === 'closed' ? 'open' : prev));
  invalidateCompareOperations();
  setCompareView(null);
  setCompareRightLoading(false);
  setCompareRightError(null);
  try {
    // The session snapshot (not the live sidebar toggle) decides chat inclusion; a
    // lazily created session adopts the current iteration so the server's
    // cycle-consistency check holds for pre-session compare views. A cycle that no
    // longer matches the iteration counter means local state diverged, so the
    // previous-cycle claim is dropped rather than relabeled with a new cycle.
    const existingSession = getAiProposalSession();
    const proposalSession: ClientProposalSession = existingSession
      ? existingSession.cycle === aiDiffIteration + 1
        ? existingSession
        : { ...existingSession, cycle: aiDiffIteration + 1, previousCycle: null }
      : {
          ...createClientProposalSession({
            originalInstruction: aiPrompt.trim(),
            includeChat: aiIncludeChat,
          }),
          cycle: aiDiffIteration + 1,
        };
    setAiProposalSession(proposalSession);
    const expectedHashes = getAiProposalExpectedHashes();
    const response = await fetch(resolveScoreEditorApiPath('/api/music/diff/feedback'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      signal: requestController.signal,
      body: JSON.stringify({
        content: currentXml,
        blocks: allFeedbackBlocks,
        userEdits: userEditDiffs,
        globalComment: aiDiffGlobalComment,
        iteration: aiDiffIteration,
        provider: aiProvider,
        model: aiModel.trim(),
        apiKey: aiApiKey.trim(),
        editEffort: aiEditEffort,
        maxTokens: aiMaxTokensMode === 'custom' ? aiMaxTokens : null,
        temperature: aiTemperatureMode === 'custom' ? aiTemperature : null,
        ...(proposalSession.includeChat ? { chatHistory: aiChatMessages } : {}),
        proposalSession: buildProposalSessionRequestPayload(proposalSession, {
          contentHash: expectedHashes.contentHash,
          identityHash: expectedHashes.identityHash,
        }),
      }),
    });
    captureApiTraceContext(response.headers);
    const serviceResponse = await readAiEditServiceResponse(response, (update) =>
      updateAiEditProgress(editRequest, update),
    );
    const result = asRecord(serviceResponse.body) || {};
    if (serviceResponse.status >= 400) {
      if (result.patch && typeof result.patch === 'object') {
        setAiOutput(JSON.stringify(result.patch, null, 2));
      }
      const message =
        typeof result.error === 'string'
          ? result.error
          : `Request failed: ${serviceResponse.status}`;
      throw new Error(message);
    }

    const patchPayload = asRecord(result.patch);
    const parsedPatch = parseMusicXmlPatch(JSON.stringify(patchPayload || {}));
    if (parsedPatch.error || !parsedPatch.patch) {
      throw new Error(parsedPatch.error || 'Service returned an invalid patch payload.');
    }
    const editProposal = findAiEditProposal(result);
    const proposedXml =
      editProposal?.proposedXml ||
      (typeof result.proposedXml === 'string' ? result.proposedXml.trim() : '');
    if (!proposedXml) {
      throw new Error('Service returned empty proposed MusicXML.');
    }
    const proposalBaseXml = editProposal?.baseXml || currentXml;

    setAiOutput(JSON.stringify(parsedPatch.patch, null, 2));
    setAiPatch(parsedPatch.patch);
    setAiPatchError(null);
    setAiPatchedXml(proposedXml);
    setAiBaseXml(proposalBaseXml);
    // A successful response begins a new proposal cycle. Do this explicitly
    // rather than relying on the transient closed-modal effect so a second
    // edit cannot diff against the prior proposal generation.
    clearCompareEditCycle();
    // Keep the standard orientation (Current left/red, Proposal right/green) so Apply
    // writes the proposal into the document. See openAiProposalCompare.
    setCompareSwapped(true);
    captureAiProposal(editProposal, proposalBaseXml);
    setCompareView({
      title: 'Assistant Proposal',
      currentXml: proposalBaseXml,
      checkpointXml: proposedXml,
      currentLabel: 'Current',
      checkpointLabel: 'Assistant Proposal',
    });
    setAiDiffIteration(
      typeof result.iteration === 'number' ? result.iteration : aiDiffIteration + 1,
    );
    setAiDiffReviews((prev) => prev.filter((review) => review.status === 'accepted'));
    setAiDiffGlobalComment('');
    setAiDiffFeedbackError(null);
    setAiDiffBlockErrors({});
    const revisionAnnotations = extractPatchAnnotations({
      annotations: (result as Record<string, unknown>).annotations,
    });
    setAiProposalSession(
      advanceClientProposalSession(proposalSession, {
        responseId: result.proposalSessionId,
        newCycle: result.cycle,
        proposal: editProposal,
        patch: parsedPatch.patch,
        annotations: revisionAnnotations,
        continuityToken: result.continuityToken,
        sentBlocks: allFeedbackBlocks,
        sentGlobalComment: aiDiffGlobalComment,
      }),
    );
    const feedbackAudit = asRecord(result.audit);
    setAiProposalAudit({
      ...(feedbackAudit ?? {}),
      cycle:
        typeof feedbackAudit?.cycle === 'number'
          ? feedbackAudit.cycle
          : typeof result.cycle === 'number'
            ? result.cycle
            : aiDiffIteration + 2,
      verification: result.verification,
    });
    // Surface the assistant's annotations for this revision as measure-thread notes.
    mergeAiAnnotations(revisionAnnotations);
    setCompareAlignmentRevision((value) => value + 1);
    requestOutcome = 'success';
  } catch (err) {
    const wasCancelled =
      requestController.signal.aborted &&
      requestController.signal.reason instanceof DOMException &&
      requestController.signal.reason.name === 'AbortError';
    const rawMessage = errorMessage(err) || 'Failed to request revised proposal.';
    const surfacedMessage = formatAiDiffFeedbackError(rawMessage);
    if (wasCancelled) {
      requestOutcome = 'cancelled';
    }
    setAiError(wasCancelled ? null : surfacedMessage);
    setAiDiffFeedbackError(wasCancelled ? null : surfacedMessage);
    setCompareRightError(wasCancelled ? null : surfacedMessage);
    if (!wasCancelled && commentBlockKeys.length > 0) {
      setAiDiffBlockErrors((prev) => {
        const next = { ...prev };
        commentBlockKeys.forEach((blockKey) => {
          next[blockKey] = surfacedMessage;
        });
        return next;
      });
    }
    setCompareView({
      title: 'Assistant Proposal',
      currentXml,
      checkpointXml: proposalXml || previousCheckpointXml,
      currentLabel: 'Current',
      checkpointLabel: 'Assistant Proposal',
    });
    restoreCompareEditCycle(previousEditCycle);
    restoreAiProposalContinuity({
      ...previousContinuity,
      baseXml: previousContinuity.baseXml || currentXml,
    });
  } finally {
    finishAiEdit(editRequest, requestOutcome);
    setCompareRightLoading(false);
  }
}

export async function updateAiOutputImpl(
  ctx: UpdateAiOutputContext,
  nextText: string,
  baseXmlOverride?: string,
): Promise<{
  ok: boolean;
  baseXml: string;
  proposedXml: string;
  error: string;
  annotations: PatchAnnotation[];
}> {
  const {
    setAiOutput,
    setAiPatch,
    setAiPatchError,
    setAiPatchedXml,
    setAiLastAnnotations,
    aiBaseXml,
    aiScoreBridge,
  } = ctx;
  setAiOutput(nextText);
  setAiPatch(null);
  setAiPatchError(null);
  setAiPatchedXml('');
  if (!nextText.trim()) {
    const error = 'AI output is empty.';
    setAiPatchError(error);
    return { ok: false, baseXml: '', proposedXml: '', error, annotations: [] };
  }
  const parsed = parseMusicXmlPatch(nextText);
  if (parsed.error || !parsed.patch) {
    const error = parsed.error || 'Invalid patch payload.';
    setAiPatchError(error);
    return { ok: false, baseXml: '', proposedXml: '', error, annotations: [] };
  }
  const annotations = parsed.annotations ?? [];
  setAiLastAnnotations(annotations);
  setAiPatch(parsed.patch);
  const baseXml = baseXmlOverride ?? aiBaseXml ?? (await aiScoreBridge.getContextXml());
  if (!baseXml.trim()) {
    const error = 'Unable to apply patch without MusicXML.';
    setAiPatchError(error);
    return { ok: false, baseXml: '', proposedXml: '', error, annotations };
  }
  const applied = applyMusicXmlPatch(baseXml, parsed.patch);
  if (applied.error || !applied.xml.trim()) {
    const error = applied.error || 'Failed to apply patch to MusicXML.';
    setAiPatchError(error);
    return { ok: false, baseXml: baseXml.trim(), proposedXml: '', error, annotations };
  }
  setAiPatchError(null);
  setAiPatchedXml(applied.xml);
  return {
    ok: true,
    baseXml: baseXml.trim(),
    proposedXml: applied.xml.trim(),
    error: '',
    annotations,
  };
}
