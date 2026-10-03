import { type CompareViewState, type CompareSide, type BlockReview } from './compare-types';
import { type StopCompareSideAudio, type PartSummary } from '../editor-types';
import React, { useEffect } from 'react';
import { type Score, type Positions, loadWebMscore } from '../../../lib/webmscore-loader';
import { type PaletteCategory } from '../../toolbar/palette';
import { type AiMeasureThread, type AiMeasureAnchor } from './CompareMeasureComments';
import { type CompareScoreRole } from '../../../lib/compare-user-edit-diff';
import { AI_DIFF_GUTTER_DEFAULT_WIDTH } from '../ai-constants';
import { parsePartsFromMetadata } from '../part-metadata';

export type CompareRightScoreLoadingContext = {
  compareView: CompareViewState | null;
  invalidateCompareOperations: (invalidateQueuedKeyboard?: boolean) => number;
  stopCompareSideAudio: StopCompareSideAudio;
  compareRightScoreRef: React.RefObject<Score | null>;
  queueCompareScoreTeardown: (
    auxiliaryScore: Score | null,
    liveScore: Score | null,
    label: string,
  ) => Promise<void>;
  scoreRef: React.RefObject<Score | null>;
  compareLoadedCheckpointXmlRef: React.RefObject<string | null>;
  setCompareRightScore: React.Dispatch<React.SetStateAction<Score | null>>;
  setCompareRightParts: React.Dispatch<React.SetStateAction<PartSummary[]>>;
  setCompareRightPageCount: React.Dispatch<React.SetStateAction<number>>;
  setCompareRightLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setCompareRightError: React.Dispatch<React.SetStateAction<string | null>>;
  setCompareFitZoom: React.Dispatch<React.SetStateAction<number>>;
  setCompareZoom: React.Dispatch<React.SetStateAction<number | null>>;
  setCompareActiveSide: React.Dispatch<React.SetStateAction<CompareSide | null>>;
  resetCompareEditing: () => void;
  setPalettesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPaletteCategory: React.Dispatch<React.SetStateAction<PaletteCategory | null>>;
  setCompareLeftSvgSize: React.Dispatch<
    React.SetStateAction<{ width: number; height: number } | null>
  >;
  setCompareRightSvgSize: React.Dispatch<
    React.SetStateAction<{ width: number; height: number } | null>
  >;
  setCompareLeftMeasurePositions: React.Dispatch<React.SetStateAction<Positions | null>>;
  setCompareRightMeasurePositions: React.Dispatch<React.SetStateAction<Positions | null>>;
  setCompareSignatures: React.Dispatch<
    React.SetStateAction<{ left: string[][]; right: string[][] } | null>
  >;
  setCompareSwapped: React.Dispatch<React.SetStateAction<boolean>>;
  setCompareLeftCheckpointLabel: React.Dispatch<React.SetStateAction<string>>;
  setCompareRightCheckpointLabel: React.Dispatch<React.SetStateAction<string>>;
  aiDiffFeedbackBusy: boolean;
  setAiDiffReviews: React.Dispatch<React.SetStateAction<BlockReview[]>>;
  setAiMeasureThreads: React.Dispatch<React.SetStateAction<Record<string, AiMeasureThread>>>;
  setAiFocusedMeasureAnchor: React.Dispatch<React.SetStateAction<AiMeasureAnchor | null>>;
  setAiMeasureThreadDraft: React.Dispatch<React.SetStateAction<string>>;
  setAiDiffIteration: React.Dispatch<React.SetStateAction<number>>;
  setAiDiffGlobalComment: React.Dispatch<React.SetStateAction<string>>;
  setAiDiffFeedbackError: React.Dispatch<React.SetStateAction<string | null>>;
  setAiDiffBlockErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  clearAiProposal: () => void;
  setAiDiffGutterWidth: React.Dispatch<React.SetStateAction<number>>;
  resetCompareEditingRole: (role: CompareScoreRole) => void;
  runSerializedScoreOperation: <T>(operation: () => Promise<T>, label: string) => Promise<T>;
};

/** Loads the right-hand compare score when compare opens, tears everything down in order when it closes, and releases it when the editor unmounts. */
export function useCompareRightScoreLoading(ctx: CompareRightScoreLoadingContext) {
  const {
    compareView,
    invalidateCompareOperations,
    stopCompareSideAudio,
    compareRightScoreRef,
    queueCompareScoreTeardown,
    scoreRef,
    compareLoadedCheckpointXmlRef,
    setCompareRightScore,
    setCompareRightParts,
    setCompareRightPageCount,
    setCompareRightLoading,
    setCompareRightError,
    setCompareFitZoom,
    setCompareZoom,
    setCompareActiveSide,
    resetCompareEditing,
    setPalettesOpen,
    setPaletteCategory,
    setCompareLeftSvgSize,
    setCompareRightSvgSize,
    setCompareLeftMeasurePositions,
    setCompareRightMeasurePositions,
    setCompareSignatures,
    setCompareSwapped,
    setCompareLeftCheckpointLabel,
    setCompareRightCheckpointLabel,
    aiDiffFeedbackBusy,
    setAiDiffReviews,
    setAiMeasureThreads,
    setAiFocusedMeasureAnchor,
    setAiMeasureThreadDraft,
    setAiDiffIteration,
    setAiDiffGlobalComment,
    setAiDiffFeedbackError,
    setAiDiffBlockErrors,
    clearAiProposal,
    setAiDiffGutterWidth,
    resetCompareEditingRole,
    runSerializedScoreOperation,
  } = ctx;

  useEffect(() => {
    if (!compareView) {
      invalidateCompareOperations();
      // awaitCancel keeps the batch-iterator cancellation inside the tracked
      // operation, so queueCompareScoreTeardown drains it before destroy().
      void stopCompareSideAudio('left', { awaitCancel: true });
      void stopCompareSideAudio('right', { awaitCancel: true });
      const auxiliaryScore = compareRightScoreRef.current;
      void queueCompareScoreTeardown(auxiliaryScore, scoreRef.current, 'compare-close');
      compareLoadedCheckpointXmlRef.current = null;
      setCompareRightScore(null);
      setCompareRightParts([]);
      setCompareRightPageCount(1);
      setCompareRightLoading(false);
      setCompareRightError(null);
      setCompareFitZoom(0.5);
      setCompareZoom(null);
      setCompareActiveSide(null);
      resetCompareEditing();
      setPalettesOpen(false);
      setPaletteCategory(null);
      setCompareLeftSvgSize(null);
      setCompareRightSvgSize(null);
      setCompareLeftMeasurePositions(null);
      setCompareRightMeasurePositions(null);
      setCompareSignatures(null);
      setCompareSwapped(false);
      setCompareLeftCheckpointLabel('');
      setCompareRightCheckpointLabel('');
      if (!aiDiffFeedbackBusy) {
        setAiDiffReviews([]);
        setAiMeasureThreads({});
        setAiFocusedMeasureAnchor(null);
        setAiMeasureThreadDraft('');
        setAiDiffIteration(0);
        setAiDiffGlobalComment('');
        setAiDiffFeedbackError(null);
        setAiDiffBlockErrors({});
        clearAiProposal();
        setAiDiffGutterWidth(AI_DIFF_GUTTER_DEFAULT_WIDTH);
      }
      return;
    }

    // Only reload checkpoint score if the XML has actually changed
    if (compareLoadedCheckpointXmlRef.current === compareView.checkpointXml) {
      return;
    }

    invalidateCompareOperations();
    let canceled = false;
    const loadCompareScore = async () => {
      // The checkpoint side is being replaced -- stop whichever visual side is
      // currently playing it before the underlying Score instance is destroyed.
      await stopCompareSideAudio('left', { awaitCancel: true });
      await stopCompareSideAudio('right', { awaitCancel: true });
      if (canceled) {
        return;
      }
      setCompareRightLoading(true);
      setCompareRightError(null);
      const scoreToReplace = compareRightScoreRef.current;
      await queueCompareScoreTeardown(scoreToReplace, null, 'compare-checkpoint-reload');
      if (canceled) {
        return;
      }
      setCompareRightScore(null);
      resetCompareEditingRole('proposal');
      try {
        const WebMscore = await loadWebMscore();
        const data = new TextEncoder().encode(compareView.checkpointXml);
        const loadedScore = await WebMscore.load('musicxml', data);
        if (canceled) {
          loadedScore.destroy();
          return;
        }
        compareRightScoreRef.current = loadedScore;
        compareLoadedCheckpointXmlRef.current = compareView.checkpointXml;
        setCompareRightScore(loadedScore);
        if (loadedScore.npages) {
          const pages = await runSerializedScoreOperation(
            () => loadedScore.npages!(),
            'npages(compare)',
          );
          if (!canceled) {
            setCompareRightPageCount(Math.max(1, pages));
          }
        }
        const metadata = await runSerializedScoreOperation(
          () => loadedScore.metadata(),
          'metadata(compare)',
        );
        if (!canceled) {
          setCompareRightParts(parsePartsFromMetadata(metadata));
        }
      } catch (err) {
        console.error('Failed to load compare checkpoint score', err);
        if (!canceled) {
          setCompareRightError('Unable to load checkpoint score.');
        }
      } finally {
        if (!canceled) {
          setCompareRightLoading(false);
        }
      }
    };

    loadCompareScore();
    return () => {
      canceled = true;
    };
  }, [
    compareView,
    aiDiffFeedbackBusy,
    clearAiProposal,
    invalidateCompareOperations,
    queueCompareScoreTeardown,
    resetCompareEditing,
    resetCompareEditingRole,
    runSerializedScoreOperation,
    stopCompareSideAudio,
    scoreRef,

    compareLoadedCheckpointXmlRef,
    compareRightScoreRef,
    setAiDiffBlockErrors,
    setAiDiffFeedbackError,
    setAiDiffGlobalComment,
    setAiDiffGutterWidth,
    setAiDiffIteration,
    setAiDiffReviews,
    setAiFocusedMeasureAnchor,
    setAiMeasureThreadDraft,
    setAiMeasureThreads,
    setCompareActiveSide,
    setCompareFitZoom,
    setCompareLeftCheckpointLabel,
    setCompareLeftMeasurePositions,
    setCompareLeftSvgSize,
    setCompareRightCheckpointLabel,
    setCompareRightError,
    setCompareRightLoading,
    setCompareRightMeasurePositions,
    setCompareRightPageCount,
    setCompareRightParts,
    setCompareRightScore,
    setCompareRightSvgSize,
    setCompareSignatures,
    setCompareSwapped,
    setCompareZoom,
    setPaletteCategory,
    setPalettesOpen,
  ]);

  useCompareTeardownOnUnmount({
    invalidateCompareOperations,
    stopCompareSideAudio,
    compareRightScoreRef,
    queueCompareScoreTeardown,
    scoreRef,
  });
}

type CompareTeardownOnUnmountContext = Pick<
  CompareRightScoreLoadingContext,
  | 'invalidateCompareOperations'
  | 'stopCompareSideAudio'
  | 'compareRightScoreRef'
  | 'queueCompareScoreTeardown'
  | 'scoreRef'
>;

/** Stops the compare audio and releases the right-hand score when the editor unmounts. */
function useCompareTeardownOnUnmount(ctx: CompareTeardownOnUnmountContext) {
  const {
    invalidateCompareOperations,
    stopCompareSideAudio,
    compareRightScoreRef,
    queueCompareScoreTeardown,
    scoreRef,
  } = ctx;

  useEffect(() => {
    // The teardown wants the scores that are current when the editor unmounts, not the ones
    // from when this effect ran, so it reads the refs through these getters.
    const currentAuxiliaryScore = () => compareRightScoreRef.current;
    const currentLiveScore = () => scoreRef.current;
    return () => {
      invalidateCompareOperations();
      void stopCompareSideAudio('left', { awaitCancel: true });
      void stopCompareSideAudio('right', { awaitCancel: true });
      void queueCompareScoreTeardown(
        currentAuxiliaryScore(),
        currentLiveScore(),
        'score-editor-unmount',
      );
    };
  }, [
    invalidateCompareOperations,
    queueCompareScoreTeardown,
    stopCompareSideAudio,
    scoreRef,
    compareRightScoreRef,
  ]);
}
