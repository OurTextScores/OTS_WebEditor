import { isIndexedDbAvailable, saveCheckpoint } from '../../../lib/checkpoints';
import { Score } from '../../../lib/webmscore-loader';
import { notifyError, notifyWarning } from '../../shell/notices';
import { toOwnedArrayBuffer } from '../byte-encoding';
import { buildCheckpointTitle } from '../checkpoint-labels';
import { errorMessage } from '../error-messages';
import { replaceMeasuresInMusicXml } from '../musicxml';
import { type MutationMethods } from '../mutation-api';
import {
  routeCompareKeyboardShortcut,
  type CompareInputStateMethod,
  type CompareKeyboardMutationMethod,
} from './compare-keyboard-policy';
import type { AiProposalHashCheck } from '../../../lib/ai-edit-proposal-client';
import type { CompareScoreRole } from '../../../lib/compare-user-edit-diff';
import type { EditorLaunchContext } from '../../../lib/editor-launch-context';
import type { AiScoreBridge } from '../ai-score-bridge';
import type { CompareSide, CompareViewState } from './compare-types';
import type { CompareClipboardEntry } from './useCompareClipboard';
import type { CompareMutationOptions, RoleRecord } from './useCompareEditing';
import type React from 'react';

export type CompareOverwriteBlockContext = {
  compareSwapBusy: boolean;
  isCompareEditBusy: () => boolean;
  hasPendingCompareOperations: () => boolean;
  setCompareSwapBusy: React.Dispatch<React.SetStateAction<boolean>>;
  compareView: CompareViewState | null;
  score: Score | null;
  getScoreMusicXmlText: (
    targetScore: Score | null,
    fallbackXml: string | null,
  ) => Promise<string | null>;
  scoreRef: React.RefObject<Score | null>;
  setAiProposalApplyError: (message: string | null) => void;
  setAiError: React.Dispatch<React.SetStateAction<string | null>>;
  verifyAiProposalCurrent: (
    liveXml: string,
    fallbackBaseXml: string,
  ) => Promise<AiProposalHashCheck>;
  aiScoreBridge: AiScoreBridge;
  recordAiProposalAppliedXml: (
    xml: string,
  ) => Promise<{ contentHash: string; identityHash: string }>;
  invalidateAiProposalExpectedCurrent: (message: string) => void;
  setCompareView: React.Dispatch<React.SetStateAction<CompareViewState | null>>;
  setCompareAlignmentRevision: React.Dispatch<React.SetStateAction<number>>;
};

export type CompareKeyboardShortcutContext = {
  queueCompareKeyboardOperation: <T>(operation: () => Promise<T>) => Promise<T | undefined>;
  performCompareMutation: (
    label: string,
    action: (targetScore: Score) => Promise<unknown> | unknown,
    options?: CompareMutationOptions,
  ) => Promise<boolean>;
  compareActiveScore: Score | null;
  runSerializedScoreOperation: <T>(operation: () => Promise<T>, label: string) => Promise<T>;
  compareView: CompareViewState | null;
  compareActiveSide: CompareSide | null;
  compareActiveRole: 'current' | 'proposal' | null;
  compareHasSelectionByRole: RoleRecord<boolean>;
  isCompareNoteInputCommitted: (role: CompareScoreRole) => boolean;
  copyCompareSelection: (targetScore: Score, side: CompareSide) => Promise<boolean>;
  clipboardRef: React.RefObject<CompareClipboardEntry | null>;
  setCompareNoteInputMode: (enabled: boolean, side?: CompareSide) => Promise<void>;
  toggleCompareNoteInputMode: (side: CompareSide) => void;
  setCompareHasSelection: (role: CompareScoreRole, selected: boolean) => void;
};

export type SaveCompareCheckpointContext = {
  compareView: CompareViewState | null;
  compareLeftIsCurrent: boolean;
  compareRightIsCurrent: boolean;
  compareLeftCheckpointLabel: string;
  compareRightCheckpointLabel: string;
  compareLeftLabel: string;
  compareRightLabel: string;
  setCheckpointBusy: React.Dispatch<React.SetStateAction<boolean>>;
  getScoreXmlData: () => Promise<Uint8Array<ArrayBufferLike> | null>;
  getScoreMusicXmlText: (
    targetScore: Score | null,
    fallbackXml: string | null,
  ) => Promise<string | null>;
  compareRightScore: Score | null;
  ensureScoreId: (fallbackPrefix: string) => string;
  buildCheckpointMetadata: (overrides?: {
    branchName?: string;
    upstreamRevisionId?: string;
    baseRevisionId?: string;
  }) =>
    | {
        upstreamKind?: undefined;
        workId?: undefined;
        sourceId?: undefined;
        branchName?: undefined;
        baseRevisionId?: undefined;
        upstreamRevisionId?: undefined;
      }
    | {
        upstreamKind: 'ourtextscores';
        workId: string;
        sourceId: string;
        branchName: string;
        baseRevisionId: string | undefined;
        upstreamRevisionId: string | undefined;
      };
  activeLaunchContext: EditorLaunchContext | null;
  versionsBranchName: string;
  loadCheckpointList: (targetScoreId?: string) => Promise<void>;
  setCompareLeftCheckpointLabel: React.Dispatch<React.SetStateAction<string>>;
  setCompareRightCheckpointLabel: React.Dispatch<React.SetStateAction<string>>;
};

export type AcceptAllAiChangesContext = {
  compareView: CompareViewState | null;
  score: Score | null;
  compareSwapBusy: boolean;
  isCompareEditBusy: () => boolean;
  hasPendingCompareOperations: () => boolean;
  setCompareSwapBusy: React.Dispatch<React.SetStateAction<boolean>>;
  aiScoreBridge: AiScoreBridge;
  setAiProposalApplyError: (message: string | null) => void;
  setAiError: React.Dispatch<React.SetStateAction<string | null>>;
  verifyAiProposalCurrent: (
    liveXml: string,
    fallbackBaseXml: string,
  ) => Promise<AiProposalHashCheck>;
  recordAiProposalAppliedXml: (
    xml: string,
  ) => Promise<{ contentHash: string; identityHash: string }>;
  setCompareView: React.Dispatch<React.SetStateAction<CompareViewState | null>>;
  setCompareAlignmentRevision: React.Dispatch<React.SetStateAction<number>>;
  invalidateAiProposalExpectedCurrent: (message: string) => void;
};

export async function compareOverwriteBlock(
  ctx: CompareOverwriteBlockContext,
  sourceScore: Score | null,
  targetScore: Score | null,
  partIndex: number,
  pairs: Array<{ leftIndex: number; rightIndex: number }>,
): Promise<boolean> {
  const {
    compareSwapBusy,
    isCompareEditBusy,
    hasPendingCompareOperations,
    setCompareSwapBusy,
    compareView,
    score,
    getScoreMusicXmlText,
    scoreRef,
    setAiProposalApplyError,
    setAiError,
    verifyAiProposalCurrent,
    aiScoreBridge,
    recordAiProposalAppliedXml,
    invalidateAiProposalExpectedCurrent,
    setCompareView,
    setCompareAlignmentRevision,
  } = ctx;
  if (compareSwapBusy || isCompareEditBusy() || hasPendingCompareOperations()) {
    return false;
  }
  if (!sourceScore || !targetScore) {
    return false;
  }
  if (pairs.length === 0) {
    return false;
  }

  setCompareSwapBusy(true);
  try {
    const isAiProposalCommit = compareView?.title === 'Assistant Proposal' && targetScore === score;
    let verifiedTargetXml: string | null = null;
    if (isAiProposalCommit) {
      const liveXml = await getScoreMusicXmlText(scoreRef.current ?? targetScore, null);
      if (!liveXml) {
        const message = 'Unable to verify the current score before applying this proposal.';
        setAiProposalApplyError(message);
        setAiError(message);
        return false;
      }
      verifiedTargetXml = liveXml;
      try {
        const hashCheck = await verifyAiProposalCurrent(liveXml, compareView.currentXml);
        if (!hashCheck.ok) {
          const message =
            'The score changed after this proposal was generated. Regenerate or rebase the proposal before applying it.';
          setAiProposalApplyError(message);
          setAiError(message);
          return false;
        }
      } catch (hashError) {
        const message =
          errorMessage(hashError) || 'Unable to verify the proposal against the current score.';
        setAiProposalApplyError(message);
        setAiError(message);
        return false;
      }
    }

    const fallbackSourceXml =
      sourceScore === score
        ? (compareView?.currentXml ?? null)
        : (compareView?.checkpointXml ?? null);
    const fallbackTargetXml =
      verifiedTargetXml ??
      (targetScore === score
        ? (compareView?.currentXml ?? null)
        : (compareView?.checkpointXml ?? null));
    const sourceXml = fallbackSourceXml ?? (await getScoreMusicXmlText(sourceScore, null));
    const targetXml = fallbackTargetXml ?? (await getScoreMusicXmlText(targetScore, null));
    if (!sourceXml || !targetXml) {
      console.warn('Compare overwrite: unable to load MusicXML for swap.');
      return false;
    }

    const patched = replaceMeasuresInMusicXml(
      sourceXml,
      targetXml,
      partIndex,
      pairs.map((pair) => ({ sourceIndex: pair.leftIndex, targetIndex: pair.rightIndex })),
    );
    if (patched.error || !patched.xml) {
      console.warn('Compare overwrite failed:', patched.error || 'Unknown error');
      return false;
    }

    if (targetScore === score) {
      const applied = await aiScoreBridge.applyXml(patched.xml, 'compare_overwrite');
      if (!applied) {
        return false;
      }
      const appliedXml =
        (await getScoreMusicXmlText(scoreRef.current ?? targetScore, patched.xml)) || patched.xml;
      if (isAiProposalCommit) {
        try {
          await recordAiProposalAppliedXml(appliedXml);
          setAiError(null);
        } catch (hashError) {
          const message =
            errorMessage(hashError) ||
            'The change was applied, but the next proposal block cannot be verified.';
          invalidateAiProposalExpectedCurrent(message);
          setAiError(message);
        }
      }
      setCompareView((prev) => (prev ? { ...prev, currentXml: appliedXml } : prev));
    } else {
      setCompareView((prev) => (prev ? { ...prev, checkpointXml: patched.xml } : prev));
    }
    setCompareAlignmentRevision((value) => value + 1);
    return true;
  } catch (err) {
    console.warn('Compare overwrite failed:', err);
    return false;
  } finally {
    setCompareSwapBusy(false);
  }
}

export function compareKeyboardShortcut(ctx: CompareKeyboardShortcutContext, event: KeyboardEvent) {
  const {
    queueCompareKeyboardOperation,
    performCompareMutation,
    compareActiveScore,
    runSerializedScoreOperation,
    compareView,
    compareActiveSide,
    compareActiveRole,
    compareHasSelectionByRole,
    isCompareNoteInputCommitted,
    copyCompareSelection,
    clipboardRef,
    setCompareNoteInputMode,
    toggleCompareNoteInputMode,
    setCompareHasSelection,
  } = ctx;
  const mutate = (
    label: string,
    methodName: CompareKeyboardMutationMethod,
    args: unknown[] = [],
    skipRelayout = false,
  ) => {
    void queueCompareKeyboardOperation(() =>
      performCompareMutation(
        label,
        (targetScore) => {
          const fn = (targetScore as MutationMethods)[methodName];
          if (typeof fn !== 'function') {
            notifyError(`This build of webmscore does not expose "${String(methodName)}".`);
            return false;
          }
          return (fn as (...values: unknown[]) => unknown).apply(targetScore, args);
        },
        { skipRelayout, preserveKeyboardQueue: true },
      ),
    ).catch((err) => {
      console.warn(`Compare keyboard mutation "${label}" failed:`, err);
    });
  };
  const updateInputState = (methodName: CompareInputStateMethod, args: unknown[] = []) => {
    const fn = compareActiveScore ? (compareActiveScore as MutationMethods)[methodName] : null;
    if (typeof fn === 'function') {
      void queueCompareKeyboardOperation(() =>
        runSerializedScoreOperation(
          () =>
            Promise.resolve(
              (fn as (...values: unknown[]) => unknown).apply(compareActiveScore, args),
            ),
          `compare-input:${String(methodName)}`,
        ),
      ).catch((err) => {
        console.warn(`Compare input shortcut "${String(methodName)}" failed:`, err);
      });
    }
  };
  return routeCompareKeyboardShortcut(event, {
    active: Boolean(compareView && compareActiveSide && compareActiveScore && compareActiveRole),
    activeRole: compareActiveRole,
    hasSelection: compareActiveRole ? compareHasSelectionByRole[compareActiveRole] : false,
    noteMode: compareActiveRole ? isCompareNoteInputCommitted(compareActiveRole) : false,
    mutate,
    updateInputState,
    copySelection: () => {
      if (!compareActiveScore || !compareActiveSide) {
        return;
      }
      const sourceScore = compareActiveScore;
      const sourceSide = compareActiveSide;
      void queueCompareKeyboardOperation(() => copyCompareSelection(sourceScore, sourceSide)).catch(
        (err) => {
          console.warn('Compare selection copy failed:', err);
        },
      );
    },
    pasteSelection: () => {
      if (!compareActiveSide) {
        return;
      }
      const targetSide = compareActiveSide;
      void queueCompareKeyboardOperation(async () => {
        // Resolve the clipboard after prior queued shortcuts complete so
        // a rapid Copy, Paste sequence sees the bytes captured by Copy.
        const clip = clipboardRef.current;
        if (!clip) {
          notifyWarning('Nothing copied yet.');
          return false;
        }
        return performCompareMutation(
          'paste selection',
          (targetScore) => {
            if (!targetScore.pasteSelection) {
              notifyError('This build of webmscore does not expose "pasteSelection".');
              return false;
            }
            return targetScore.pasteSelection(clip.mimeType, clip.data);
          },
          {
            side: targetSide,
            preserveKeyboardQueue: true,
          },
        );
      }).catch((err) => {
        console.warn('Compare selection paste failed:', err);
      });
    },
    disableNoteInput: () => {
      if (compareActiveSide) {
        void setCompareNoteInputMode(false, compareActiveSide);
      }
    },
    toggleNoteInput: () => {
      if (compareActiveSide) {
        toggleCompareNoteInputMode(compareActiveSide);
      }
    },
    setHasSelection: setCompareHasSelection,
  });
}

export async function saveCompareCheckpoint(
  ctx: SaveCompareCheckpointContext,
  side: 'left' | 'right',
) {
  const {
    compareView,
    compareLeftIsCurrent,
    compareRightIsCurrent,
    compareLeftCheckpointLabel,
    compareRightCheckpointLabel,
    compareLeftLabel,
    compareRightLabel,
    setCheckpointBusy,
    getScoreXmlData,
    getScoreMusicXmlText,
    compareRightScore,
    ensureScoreId,
    buildCheckpointMetadata,
    activeLaunchContext,
    versionsBranchName,
    loadCheckpointList,
    setCompareLeftCheckpointLabel,
    setCompareRightCheckpointLabel,
  } = ctx;
  if (!compareView) {
    return;
  }
  if (!isIndexedDbAvailable()) {
    notifyWarning('IndexedDB is not available in this browser.');
    return;
  }

  const targetIsCurrent = side === 'left' ? compareLeftIsCurrent : compareRightIsCurrent;
  const customLabel = side === 'left' ? compareLeftCheckpointLabel : compareRightCheckpointLabel;
  const sourceLabel = side === 'left' ? compareLeftLabel : compareRightLabel;

  setCheckpointBusy(true);
  try {
    let xmlData: Uint8Array;

    if (targetIsCurrent) {
      // Saving the current score - get its XML directly
      const currentXmlData = await getScoreXmlData();
      if (!currentXmlData) {
        notifyError('Unable to read current score MusicXML.');
        return;
      }
      xmlData = currentXmlData;
    } else {
      // Saving a checkpoint - get its XML
      const xml = await getScoreMusicXmlText(compareRightScore, compareView.checkpointXml);
      if (!xml) {
        notifyError('Unable to read checkpoint MusicXML.');
        return;
      }
      xmlData = new TextEncoder().encode(xml);
    }

    const activeScoreId = ensureScoreId('score');
    const title = buildCheckpointTitle(customLabel, sourceLabel);
    await saveCheckpoint({
      title,
      createdAt: Date.now(),
      format: 'musicxml',
      data: toOwnedArrayBuffer(xmlData),
      size: xmlData.byteLength,
      scoreId: activeScoreId,
      ...buildCheckpointMetadata({
        branchName: targetIsCurrent ? activeLaunchContext?.branchName : versionsBranchName,
      }),
    });
    await loadCheckpointList();
    // Clear the label field after saving
    if (side === 'left') {
      setCompareLeftCheckpointLabel('');
    } else {
      setCompareRightCheckpointLabel('');
    }
  } catch (err) {
    console.error('Failed to save compare checkpoint', err);
    notifyError('Failed to save compare checkpoint. See console for details.');
  } finally {
    setCheckpointBusy(false);
  }
}

export async function acceptAllAiChanges(ctx: AcceptAllAiChangesContext) {
  const {
    compareView,
    score,
    compareSwapBusy,
    isCompareEditBusy,
    hasPendingCompareOperations,
    setCompareSwapBusy,
    aiScoreBridge,
    setAiProposalApplyError,
    setAiError,
    verifyAiProposalCurrent,
    recordAiProposalAppliedXml,
    setCompareView,
    setCompareAlignmentRevision,
    invalidateAiProposalExpectedCurrent,
  } = ctx;
  if (!compareView || compareView.title !== 'Assistant Proposal') {
    return;
  }
  if (!score) {
    return;
  }
  if (compareSwapBusy || isCompareEditBusy() || hasPendingCompareOperations()) {
    return;
  }

  setCompareSwapBusy(true);
  let committedXml: string | null = null;
  try {
    const liveXml = await aiScoreBridge.getLiveXml();
    if (!liveXml) {
      const message = 'Unable to verify the current score before applying this proposal.';
      setAiProposalApplyError(message);
      setAiError(message);
      return;
    }
    const hashCheck = await verifyAiProposalCurrent(liveXml, compareView.currentXml);
    if (!hashCheck.ok) {
      const message =
        'The score changed after this proposal was generated. Regenerate or rebase the proposal before applying it.';
      setAiProposalApplyError(message);
      setAiError(message);
      return;
    }

    const applied = await aiScoreBridge.applyXml(compareView.checkpointXml, 'compare_apply_all');
    if (!applied) {
      return;
    }
    const appliedXml =
      (await aiScoreBridge.getLiveXml(compareView.checkpointXml)) || compareView.checkpointXml;
    committedXml = appliedXml;
    await recordAiProposalAppliedXml(appliedXml);
    setAiError(null);
    setCompareView((prev) => (prev ? { ...prev, currentXml: appliedXml } : prev));
    setCompareAlignmentRevision((value) => value + 1);
  } catch (applyError) {
    const message = committedXml
      ? 'The proposal was applied, but its new content hash could not be recorded.'
      : errorMessage(applyError) || 'Unable to apply the complete proposal.';
    if (committedXml) {
      invalidateAiProposalExpectedCurrent(message);
      setCompareView((prev) => (prev ? { ...prev, currentXml: committedXml! } : prev));
      setCompareAlignmentRevision((value) => value + 1);
    }
    setAiProposalApplyError(message);
    setAiError(message);
  } finally {
    setCompareSwapBusy(false);
  }
}
