import {
  type CompareViewState,
  type PartAlignment,
  type CompareAppliedSpacer,
} from './compare-types';
import type { Score, Positions } from '../../../lib/webmscore-loader';
import React, { useRef, useEffect } from 'react';
import {
  applyMeasureLineBreaks,
  refreshMeasurePositions,
  fetchMeasureLineBreaks,
} from '../score-measures';
import {
  buildCompareReflowPlan,
  buildCompareSystemGeometry,
  buildResyncBreaks,
  buildAlignmentGaps,
  mergeAlignmentGaps,
  type MeasureGap,
  measureStructuralGapResidual,
} from './compare-reflow-plan';
import { buildMismatchBreaks } from '../alignment';

export type CompareReflowContext = {
  compareView: CompareViewState | null;
  score: Score | null;
  compareReflowMode: boolean;
  compareLeftScore: Score | null;
  compareRightScoreDisplay: Score | null;
  compareRightScore: Score | null;
  compareSupportsReflow: boolean;
  compareContinuousMode: boolean;
  currentPageRef: React.RefObject<number>;
  renderScoreToContainer: (
    currentScore: Score,
    container: HTMLDivElement | null,
    pageIndex?: number,
    highlightSelection?: boolean,
  ) => Promise<boolean>;
  compareLeftContainerRef: React.RefObject<HTMLDivElement | null>;
  syncCompareSvgSize: (
    container: HTMLDivElement | null,
    setSize: React.Dispatch<React.SetStateAction<{ width: number; height: number } | null>>,
  ) => void;
  setCompareLeftSvgSize: React.Dispatch<
    React.SetStateAction<{ width: number; height: number } | null>
  >;
  setCompareLeftMeasurePositions: React.Dispatch<React.SetStateAction<Positions | null>>;
  compareRightContainerRef: React.RefObject<HTMLDivElement | null>;
  setCompareRightSvgSize: React.Dispatch<
    React.SetStateAction<{ width: number; height: number } | null>
  >;
  setCompareRightMeasurePositions: React.Dispatch<React.SetStateAction<Positions | null>>;
  setCompareRightError: React.Dispatch<React.SetStateAction<string | null>>;
  compareAlignments: PartAlignment[];
  comparePartCount: number;
};

/** Keeps the two compare panes in step with the live score: restores line breaks and alignment spacers when compare or reflow mode ends, and applies the reflow workflow while it is on. */
export function useCompareReflow(ctx: CompareReflowContext) {
  const {
    compareView,
    score,
    compareReflowMode,
    compareLeftScore,
    compareRightScoreDisplay,
    compareRightScore,
    compareSupportsReflow,
    compareContinuousMode,
    currentPageRef,
    renderScoreToContainer,
    compareLeftContainerRef,
    syncCompareSvgSize,
    setCompareLeftSvgSize,
    setCompareLeftMeasurePositions,
    compareRightContainerRef,
    setCompareRightSvgSize,
    setCompareRightMeasurePositions,
    setCompareRightError,
    compareAlignments,
    comparePartCount,
  } = ctx;

  const compareLineBreakRestoreRef = useRef<{ live: boolean[]; auxiliary: boolean[] } | null>(null);

  const compareAppliedSpacersRef = useRef<CompareAppliedSpacer[]>([]);

  const compareReflowQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let canceled = false;
    const isCurrent = () => !canceled;

    const clearAlignmentSpacers = async () => {
      const applied = compareAppliedSpacersRef.current;
      compareAppliedSpacersRef.current = [];
      for (const spacer of applied) {
        try {
          await spacer.score.setMeasureSpacer?.(spacer.measureIndex, spacer.staffIndex, 0);
        } catch (err) {
          console.warn('Failed to remove compare alignment spacer:', err);
        }
      }
    };

    const enqueueReflow = (operation: () => Promise<void>) => {
      const queued = compareReflowQueueRef.current.catch(() => {}).then(operation);
      compareReflowQueueRef.current = queued;
      void queued.catch((err) => {
        console.warn('Failed to update compare reflow:', err);
      });
    };

    if (!compareView) {
      const restore = compareLineBreakRestoreRef.current;
      compareLineBreakRestoreRef.current = null;
      if (restore || compareAppliedSpacersRef.current.length) {
        enqueueReflow(async () => {
          await clearAlignmentSpacers();
          if (restore && score) {
            await applyMeasureLineBreaks(score, restore.live);
          }
        });
      }
      return () => {
        canceled = true;
      };
    }

    if (!compareReflowMode) {
      const restore = compareLineBreakRestoreRef.current;
      compareLineBreakRestoreRef.current = null;
      const restoreLeftPaneScore = compareLeftScore;
      const restoreRightPaneScore = compareRightScoreDisplay;
      if (restore || compareAppliedSpacersRef.current.length) {
        enqueueReflow(async () => {
          await clearAlignmentSpacers();
          if (
            !restore ||
            !score ||
            !compareRightScore ||
            !compareSupportsReflow ||
            !restoreLeftPaneScore ||
            !restoreRightPaneScore
          ) {
            return;
          }
          await applyMeasureLineBreaks(score, restore.live);
          await applyMeasureLineBreaks(compareRightScore, restore.auxiliary);
          if (!isCurrent()) {
            return;
          }
          const targetPage = compareContinuousMode ? 0 : currentPageRef.current;
          // Pane content must follow the orientation mapping, not the raw
          // live/auxiliary scores: which pane holds the live score depends on the
          // compare mode, so rendering `score` straight into the left container puts
          // each score in the other pane and writes the wrong score's measure
          // positions into the state that click hit-testing reads. Same rule as the
          // continuous-layout path above, which already says so.
          await renderScoreToContainer(
            restoreLeftPaneScore,
            compareLeftContainerRef.current,
            targetPage,
            true,
          );
          syncCompareSvgSize(compareLeftContainerRef.current, setCompareLeftSvgSize);
          await refreshMeasurePositions(restoreLeftPaneScore, setCompareLeftMeasurePositions);
          await renderScoreToContainer(
            restoreRightPaneScore,
            compareRightContainerRef.current,
            targetPage,
            true,
          );
          syncCompareSvgSize(compareRightContainerRef.current, setCompareRightSvgSize);
          const rightPositionsOk = await refreshMeasurePositions(
            restoreRightPaneScore,
            setCompareRightMeasurePositions,
          );
          if (!rightPositionsOk) {
            setCompareRightError(
              (prev) => prev ?? 'Unable to compute compare highlights for checkpoint score.',
            );
          }
        });
      }
      return () => {
        canceled = true;
      };
    }

    if (!compareView || !score || !compareRightScore) {
      return;
    }
    if (!compareSupportsReflow) {
      return;
    }

    const applyReflow = async () => {
      await clearAlignmentSpacers();
      if (!isCurrent()) {
        return;
      }
      const cached = compareLineBreakRestoreRef.current;
      let liveBreaks = cached?.live ?? [];
      let auxiliaryBreaks = cached?.auxiliary ?? [];
      if (!cached) {
        liveBreaks = await fetchMeasureLineBreaks(score);
        auxiliaryBreaks = await fetchMeasureLineBreaks(compareRightScore);
      }
      if (!isCurrent()) {
        return;
      }
      if (!compareLineBreakRestoreRef.current) {
        compareLineBreakRestoreRef.current = { live: liveBreaks, auxiliary: auxiliaryBreaks };
      }
      // Pane-oriented alignments and score-oriented break arrays are reconciled in
      // buildCompareReflowPlan, which is unit tested for the swapped case.
      const { liveReflow, auxiliaryReflow } = buildCompareReflowPlan({
        liveBreaks,
        auxiliaryBreaks,
        liveIsLeftPane: compareLeftScore === score,
        alignments: compareAlignments,
        buildMismatchBreaks,
      });
      const withResync = (breaks: boolean[], indices: Set<number>) => {
        if (!indices.size) {
          return breaks;
        }
        const next = [...breaks];
        indices.forEach((measureIndex) => {
          if (measureIndex >= 0 && measureIndex < next.length) {
            next[measureIndex] = true;
          }
        });
        return next;
      };
      const reflowLeftPaneScore = compareLeftScore;
      const reflowRightPaneScore = compareRightScoreDisplay;
      if (!reflowLeftPaneScore || !reflowRightPaneScore) {
        return;
      }
      const targetPage = compareContinuousMode ? 0 : currentPageRef.current;
      const renderAndMeasure = async () => {
        let leftPositions: Positions | null = null;
        let rightPositions: Positions | null = null;
        await renderScoreToContainer(
          reflowLeftPaneScore,
          compareLeftContainerRef.current,
          targetPage,
          true,
        );
        await refreshMeasurePositions(reflowLeftPaneScore, (positions) => {
          leftPositions = positions;
        });
        await renderScoreToContainer(
          reflowRightPaneScore,
          compareRightContainerRef.current,
          targetPage,
          true,
        );
        await refreshMeasurePositions(reflowRightPaneScore, (positions) => {
          rightPositions = positions;
        });
        return { leftPositions, rightPositions };
      };
      const publishLayout = ({
        leftPositions,
        rightPositions,
      }: {
        leftPositions: Positions | null;
        rightPositions: Positions | null;
      }) => {
        syncCompareSvgSize(compareLeftContainerRef.current, setCompareLeftSvgSize);
        syncCompareSvgSize(compareRightContainerRef.current, setCompareRightSvgSize);
        setCompareLeftMeasurePositions(leftPositions);
        setCompareRightMeasurePositions(rightPositions);
        if (!rightPositions) {
          setCompareRightError(
            (prev) => prev ?? 'Unable to compute compare highlights for checkpoint score.',
          );
        }
      };

      // Phase 1: establish the deterministic mismatch-block layout. Any previous
      // resync breaks are removed because these arrays start from the saved originals.
      await applyMeasureLineBreaks(score, liveReflow);
      await applyMeasureLineBreaks(compareRightScore, auxiliaryReflow);
      if (!isCurrent()) {
        return;
      }
      let settled = await renderAndMeasure();
      if (!isCurrent() || !settled.leftPositions || !settled.rightPositions) {
        if (isCurrent()) publishLayout(settled);
        return;
      }

      // Phase 2: measure natural wrap divergence from that exact layout, apply the
      // union once, then measure the settled resync result directly. No React state
      // participates in the dependency chain, so a later render cannot shrink the
      // plan and undo it.
      const naturalLeft = buildCompareSystemGeometry(settled.leftPositions);
      const naturalRight = buildCompareSystemGeometry(settled.rightPositions);
      const leftResync = new Set<number>();
      const rightResync = new Set<number>();
      compareAlignments.forEach((alignment) => {
        const breaks = buildResyncBreaks(
          alignment.rows,
          naturalLeft.systemOf,
          naturalRight.systemOf,
        );
        breaks.left.forEach((measureIndex) => leftResync.add(measureIndex));
        breaks.right.forEach((measureIndex) => rightResync.add(measureIndex));
      });
      if (leftResync.size || rightResync.size) {
        const liveIsLeft = compareLeftScore === score;
        await applyMeasureLineBreaks(
          score,
          withResync(liveReflow, liveIsLeft ? leftResync : rightResync),
        );
        await applyMeasureLineBreaks(
          compareRightScore,
          withResync(auxiliaryReflow, liveIsLeft ? rightResync : leftResync),
        );
        if (!isCurrent()) {
          return;
        }
        settled = await renderAndMeasure();
      }
      if (!isCurrent() || !settled.leftPositions || !settled.rightPositions) {
        if (isCurrent()) publishLayout(settled);
        return;
      }

      // Phase 3: only null-sided alignment rows represent actual missing music.
      // Compute each part independently, then take the maximum at an anchor so the
      // same temporal deficit is not multiplied by the score's part count.
      const settledLeft = buildCompareSystemGeometry(settled.leftPositions);
      const settledRight = buildCompareSystemGeometry(settled.rightPositions);
      const structuralAlignments = compareAlignments.filter((alignment) =>
        alignment.rows.some((row) => row.leftIndex === null || row.rightIndex === null),
      );
      const gapPlans = structuralAlignments.map((alignment) =>
        buildAlignmentGaps(
          alignment.rows,
          settledLeft.systemOf,
          settledRight.systemOf,
          settledLeft.systemHeight,
          settledRight.systemHeight,
        ),
      );
      const leftGaps = mergeAlignmentGaps(gapPlans.map((plan) => plan.left));
      const rightGaps = mergeAlignmentGaps(gapPlans.map((plan) => plan.right));
      const applyGaps = async (targetScore: Score, gaps: MeasureGap[]) => {
        if (!gaps.length || !targetScore.setMeasureSpacer || !targetScore.getSpatium) {
          return { applied: [] as MeasureGap[], spatium: 0 };
        }
        const spatium = Number(await targetScore.getSpatium());
        if (!Number.isFinite(spatium) || spatium <= 0 || !isCurrent()) {
          return { applied: [] as MeasureGap[], spatium: 0 };
        }
        const appliedGaps: MeasureGap[] = [];
        for (const gap of gaps) {
          if (!isCurrent()) {
            break;
          }
          // One spacer per temporal anchor is sufficient; using every part's
          // row would multiply the same deficit. Page units become spatium here.
          const staffIndex = Math.max(comparePartCount - 1, 0);
          const applied = await targetScore.setMeasureSpacer(
            gap.measureIndex,
            staffIndex,
            gap.gap / spatium,
          );
          if (applied !== false) {
            compareAppliedSpacersRef.current.push({
              score: targetScore,
              measureIndex: gap.measureIndex,
              staffIndex,
            });
            appliedGaps.push(gap);
          }
        }
        return { applied: appliedGaps, spatium };
      };
      const leftApplied = await applyGaps(reflowLeftPaneScore, leftGaps);
      const rightApplied = await applyGaps(reflowRightPaneScore, rightGaps);
      if (!isCurrent()) {
        return;
      }
      if (leftApplied.applied.length || rightApplied.applied.length) {
        settled = await renderAndMeasure();
      }
      if (!isCurrent() || !settled.leftPositions || !settled.rightPositions) {
        if (isCurrent()) publishLayout(settled);
        return;
      }

      // A MuseScore spacer stores an absolute minimum clearance, while the planner
      // computes additional vertical space. Measure what the first application
      // actually moved, then add the remaining paired-row offset to that same anchor.
      // This keeps the bridge primitive unit-agnostic and includes the score's
      // pre-existing staff/system clearance without trying to reproduce engraving
      // skyline rules in TypeScript.
      const residual = measureStructuralGapResidual(
        structuralAlignments,
        settled.leftPositions,
        settled.rightPositions,
      );
      const correctAppliedGap = async (
        targetScore: Score,
        result: { applied: MeasureGap[]; spatium: number },
        correction: number,
      ) => {
        const anchor = result.applied[0];
        if (
          !anchor ||
          correction <= 0 ||
          result.spatium <= 0 ||
          !targetScore.setMeasureSpacer ||
          !isCurrent()
        ) {
          return false;
        }
        const corrected = await targetScore.setMeasureSpacer(
          anchor.measureIndex,
          Math.max(comparePartCount - 1, 0),
          (anchor.gap + correction) / result.spatium,
        );
        return corrected !== false;
      };
      const leftCorrected = await correctAppliedGap(
        reflowLeftPaneScore,
        leftApplied,
        residual.left,
      );
      const rightCorrected = await correctAppliedGap(
        reflowRightPaneScore,
        rightApplied,
        residual.right,
      );
      if (!isCurrent()) {
        return;
      }
      if (leftCorrected || rightCorrected) {
        settled = await renderAndMeasure();
      }
      if (isCurrent()) {
        publishLayout(settled);
      }
    };

    enqueueReflow(applyReflow);
    return () => {
      canceled = true;
    };
  }, [
    compareView,
    compareReflowMode,
    compareSupportsReflow,
    score,
    compareRightScore,
    compareLeftScore,
    compareRightScoreDisplay,
    compareContinuousMode,
    compareAlignments,
    comparePartCount,
    renderScoreToContainer,
    syncCompareSvgSize,
    currentPageRef,
    compareLeftContainerRef,
    compareRightContainerRef,
    setCompareLeftMeasurePositions,
    setCompareLeftSvgSize,
    setCompareRightError,
    setCompareRightMeasurePositions,
    setCompareRightSvgSize,
  ]);
}
