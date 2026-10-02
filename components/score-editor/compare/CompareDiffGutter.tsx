import type { ReactNode, RefObject } from 'react';
import type { Positions, Score } from '@/lib/webmscore-loader';
import { AiDiffBlockReview } from '../AiDiffBlockReview';
import type {
  AiDiffBlockRef,
  BlockReview,
  BlockReviewStatus,
  ChangeReviewBar,
  ChangeReviewDetail,
  ChangeReviewScoreRegion,
  ChangeReviewThread,
  CompareBlockComment,
} from './compare-types';

/**
 * The compare diff gutter: the per-part column between the two panes that shows
 * mismatch blocks, per-block review actions, and change-review threads.
 *
 * Extracted from ScoreEditor as a presentational owner. It reads 57 distinct values,
 * which is why they arrive as six cohesive models rather than as a flat prop list --
 * a flat list of that size is the prop dump the sprint's TD-03 contract rejects.
 *
 * `panes` is deliberately a { left, right } record rather than eight sibling props.
 * Two separate defects this sprint came from left/right transposition, and this shape
 * collapses eight independent chances to transpose into a single reviewable site.
 */
type PaneModel = {
  bounds: MeasureBoundsLike[];
  measurePositions: Positions | null;
  parts: PartLike[];
  score: Score | null;
};

type MeasureBoundsLike = { top: number; height: number };
type PartLike = { name?: string; instrumentName?: string };

type AlignmentRowLike = {
  leftIndex: number | null;
  rightIndex: number | null;
  match: boolean;
};

type AlignmentLike = {
  rows: AlignmentRowLike[];
  leftCount: number;
  rightCount: number;
};

type MismatchBlockLike = { start: number; end: number };

export type CompareDiffGutterProps = {
  mode: {
    isAiCompareMode: boolean;
    isChangeReviewCompareMode: boolean;
    hosted: boolean;
  };
  /** Keyed by visual side. Build this once; never pass the halves separately. */
  panes: { left: PaneModel; right: PaneModel };
  layout: {
    partCount: number;
    rowHeight: number;
    trackHeight: number;
    headerSpacerHeight: number;
    regionRefs: RefObject<Map<string, HTMLDivElement>>;
    alignmentByPart: Map<number, AlignmentLike>;
    alignmentLoading: boolean;
    signatures: { left: string[][]; right: string[][] } | null;
    /**
     * Real vertical extent of one part's bar in a pane, in the same space as
     * `panes.*.bounds`. Null when the engine could not supply staff geometry, in which
     * case the caller falls back to slicing the system box evenly. The owner computes
     * this so the gutter stays presentational and one geometry rule serves both panes.
     */
    resolvePartBounds?: (
      side: 'left' | 'right',
      measureIndex: number,
      partIndex: number,
    ) => { top: number; height: number } | null;
  };
  diff: {
    blockContentSignature: (
      signatures: { left: string[][]; right: string[][] } | null,
      partIndex: number,
      leftIndices: number[],
      rightIndices: number[],
    ) => string;
    blockErrors: Record<string, string>;
    feedbackBusy: boolean;
    bindCommentTextarea: (blockKey: string, element: HTMLTextAreaElement | null) => void;
    clearBlockError: (blockKey: string) => void;
    commitBlockComment: (block: AiDiffBlockRef) => void;
    editBlockComment: (block: AiDiffBlockRef) => void;
    onAcceptBlock: (
      block: AiDiffBlockRef,
      pairs: Array<{ leftIndex: number; rightIndex: number }>,
    ) => Promise<void>;
    onBlockCommentInput: (block: AiDiffBlockRef) => void;
    onCommentResize: (element: HTMLTextAreaElement) => void;
    resolveReview: (block: AiDiffBlockRef) => BlockReview | undefined;
    setBlockStatus: (block: AiDiffBlockRef, status: BlockReviewStatus) => void;
  };
  review: {
    actionBusy: boolean;
    barsForGutter: ChangeReviewBar[];
    detail: ChangeReviewDetail | null;
    focusedAnchorId: string | null;
    loading: boolean;
    newThreadAnchorId: string | null;
    newThreadContent: string;
    regionsInMeasureOrder: ChangeReviewScoreRegion[];
    threadsByAnchor: Map<string, ChangeReviewThread>;
    renderThread: (thread: ChangeReviewThread) => ReactNode;
    /**
     * Creates a thread on an anchor. The gutter states the intent; the owner holds
     * the endpoint, the patchset, the busy/error cycle and the field reset, so the
     * review API contract stays in one place.
     */
    createThread: (anchorId: string, content: string) => Promise<void>;
    setFocusedAnchorId: (value: string | null) => void;
    setNewThreadAnchorId: (value: string | null) => void;
    setNewThreadContent: (value: string) => void;
  };
  blocks: {
    buildMismatchBlocks: (rows: AlignmentRowLike[]) => MismatchBlockLike[];
    comments: Record<string, CompareBlockComment>;
    setComments: (
      update: (prev: Record<string, CompareBlockComment>) => Record<string, CompareBlockComment>,
    ) => void;
    focusedKey: string | null;
    setFocusedKey: (value: string | null) => void;
    editBusy: boolean;
    swapBusy: boolean;
    rightError: string | null;
    onOverwrite: (
      sourceScore: Score | null,
      targetScore: Score | null,
      partIndex: number,
      pairs: Array<{ leftIndex: number; rightIndex: number }>,
    ) => Promise<boolean>;
  };
};

export function CompareDiffGutter({
  mode,
  panes,
  layout,
  diff,
  review,
  blocks,
}: CompareDiffGutterProps) {
  // Single explicit mapping column. The JSX below is moved verbatim from ScoreEditor,
  // so this block is the only place a name can be bound to the wrong value -- keep it
  // aligned and readable rather than inlining these into the markup.
  const { isAiCompareMode, isChangeReviewCompareMode, hosted } = mode;

  const compareLeftBounds = panes.left.bounds;
  const compareLeftMeasurePositions = panes.left.measurePositions;
  const compareLeftParts = panes.left.parts;
  const compareLeftScore = panes.left.score;
  const compareRightBounds = panes.right.bounds;
  const compareRightMeasurePositions = panes.right.measurePositions;
  const compareRightPartsDisplay = panes.right.parts;
  const compareRightScoreDisplay = panes.right.score;

  const comparePartCount = layout.partCount;
  const compareGutterRowHeight = layout.rowHeight;
  const compareGutterTrackHeight = layout.trackHeight;
  const compareHeaderSpacerHeight = layout.headerSpacerHeight;
  const compareGutterRegionRefs = layout.regionRefs;
  const compareAlignmentByPart = layout.alignmentByPart;
  const compareAlignmentLoading = layout.alignmentLoading;
  const compareSignatures = layout.signatures;
  const resolvePartBounds = layout.resolvePartBounds;

  const aiDiffBlockContentSignature = diff.blockContentSignature;
  const aiDiffBlockErrors = diff.blockErrors;
  const aiDiffFeedbackBusy = diff.feedbackBusy;
  const bindAiDiffCommentTextarea = diff.bindCommentTextarea;
  const clearAiDiffBlockError = diff.clearBlockError;
  const commitAiDiffBlockComment = diff.commitBlockComment;
  const editAiDiffBlockComment = diff.editBlockComment;
  const handleAcceptAiDiffBlock = diff.onAcceptBlock;
  const handleAiDiffBlockCommentInput = diff.onBlockCommentInput;
  const handleAiDiffCommentResize = diff.onCommentResize;
  const resolveAiDiffReview = diff.resolveReview;
  const setAiDiffBlockStatus = diff.setBlockStatus;

  const changeReviewActionBusy = review.actionBusy;
  const changeReviewCompareBarsForGutter = review.barsForGutter;
  const changeReviewDetail = review.detail;
  const changeReviewFocusedAnchorId = review.focusedAnchorId;
  const changeReviewLoading = review.loading;
  const changeReviewNewThreadAnchorId = review.newThreadAnchorId;
  const changeReviewNewThreadContent = review.newThreadContent;
  const changeReviewRegionsInMeasureOrder = review.regionsInMeasureOrder;
  const changeReviewThreadsByAnchor = review.threadsByAnchor;
  const renderChangeReviewThread = review.renderThread;
  const createChangeReviewThread = review.createThread;
  const setChangeReviewFocusedAnchorId = review.setFocusedAnchorId;
  const setChangeReviewNewThreadAnchorId = review.setNewThreadAnchorId;
  const setChangeReviewNewThreadContent = review.setNewThreadContent;

  const buildMismatchBlocks = blocks.buildMismatchBlocks;
  const compareBlockComments = blocks.comments;
  const setCompareBlockComments = blocks.setComments;
  const compareFocusedBlockKey = blocks.focusedKey;
  const setCompareFocusedBlockKey = blocks.setFocusedKey;
  const compareEditBusy = blocks.editBusy;
  const compareSwapBusy = blocks.swapBusy;
  const compareRightError = blocks.rightError;
  const handleCompareOverwriteBlock = blocks.onOverwrite;

  return (
    <>
      {!compareAlignmentLoading &&
        Array.from({ length: comparePartCount }).map((_, index) => {
          if (isChangeReviewCompareMode && index > 0) {
            return null;
          }
          const alignment = compareAlignmentByPart.get(index);
          const rows = alignment?.rows ?? [];
          const blocks = buildMismatchBlocks(rows);
          const changeReviewRegions = isChangeReviewCompareMode
            ? changeReviewRegionsInMeasureOrder
            : [];
          const partName = isChangeReviewCompareMode
            ? 'All parts'
            : compareLeftParts[index]?.name ||
              compareLeftParts[index]?.instrumentName ||
              compareRightPartsDisplay[index]?.name ||
              compareRightPartsDisplay[index]?.instrumentName ||
              `Part ${index + 1}`;
          return (
            <div
              key={`compare-gutter-${index}`}
              className="flex flex-col gap-2 rounded border border-dashed border-slate-200 bg-white px-2 py-2"
            >
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                <span>{partName}</span>
                {isChangeReviewCompareMode && (
                  <span>
                    {changeReviewRegions.length} review line
                    {changeReviewRegions.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <div className="grid gap-2">
                {rows.length === 0 && (
                  <div className="rounded border border-dashed border-slate-200 bg-slate-50 px-2 py-2 text-center text-[10px] text-slate-400">
                    No measures
                  </div>
                )}
                {!isChangeReviewCompareMode && blocks.length === 0 && rows.length > 0 && (
                  <div className="text-center text-[10px] text-slate-400">No changes</div>
                )}
                {isChangeReviewCompareMode &&
                  !changeReviewLoading &&
                  rows.length > 0 &&
                  changeReviewRegions.length === 0 &&
                  changeReviewCompareBarsForGutter.length === 0 && (
                    <div className="text-center text-[10px] text-slate-400">
                      No commentable diff lines
                    </div>
                  )}
                {isChangeReviewCompareMode &&
                  (changeReviewRegions.length > 0 || changeReviewCompareBarsForGutter.length > 0) &&
                  compareLeftMeasurePositions &&
                  compareRightMeasurePositions && (
                    <div
                      className="relative w-full"
                      style={{ height: `${compareGutterTrackHeight}px` }}
                      onClick={() => setChangeReviewFocusedAnchorId(null)}
                    >
                      {changeReviewRegions.map((region) => {
                        const thread = changeReviewThreadsByAnchor.get(region.anchorId);
                        const leftIndex = region.baseMeasureIndex ?? null;
                        const rightIndex = region.headMeasureIndex ?? null;
                        const leftDiff = leftIndex !== null;
                        const rightDiff = rightIndex !== null;
                        const regionColorClasses =
                          region.changeType === 'added'
                            ? 'border-emerald-300'
                            : region.changeType === 'removed'
                              ? 'border-rose-300'
                              : 'border-amber-300';
                        const isFocused = changeReviewFocusedAnchorId === region.anchorId;
                        const isDimmed = changeReviewFocusedAnchorId !== null && !isFocused;
                        const regionBounds: Array<{ top: number; height: number }> = [];
                        if (leftIndex !== null && compareLeftBounds[leftIndex]) {
                          const b = compareLeftBounds[leftIndex];
                          const partH = b.height / comparePartCount;
                          regionBounds.push(
                            resolvePartBounds?.('left', leftIndex, region.partIndex) ?? {
                              top: b.top + partH * region.partIndex,
                              height: partH,
                            },
                          );
                        }
                        if (rightIndex !== null && compareRightBounds[rightIndex]) {
                          const b = compareRightBounds[rightIndex];
                          const partH = b.height / comparePartCount;
                          regionBounds.push(
                            resolvePartBounds?.('right', rightIndex, region.partIndex) ?? {
                              top: b.top + partH * region.partIndex,
                              height: partH,
                            },
                          );
                        }
                        const blockTop = regionBounds.length
                          ? Math.min(...regionBounds.map((b) => b.top))
                          : compareHeaderSpacerHeight;
                        // Use the natural part-row span so adjacent-part cards on the
                        // same system don't overlap (mirrors single-source gutter behaviour).
                        const blockHeight = regionBounds.length
                          ? Math.max(...regionBounds.map((b) => b.top + b.height)) - blockTop
                          : compareGutterRowHeight;
                        return (
                          <div
                            key={`compare-review-region-${index}-${region.anchorId}`}
                            ref={(el) => {
                              if (el) compareGutterRegionRefs.current.set(region.anchorId, el);
                              else compareGutterRegionRefs.current.delete(region.anchorId);
                            }}
                            className={`absolute left-0 right-0 cursor-pointer rounded border bg-white px-2 py-2 transition-opacity duration-150 ${regionColorClasses}${isDimmed ? ' opacity-40' : ''}${isFocused ? ' ring-2 ring-blue-400 shadow-raised' : ''}`}
                            style={{
                              top: `${blockTop}px`,
                              minHeight: `${blockHeight}px`,
                              zIndex: isFocused ? 50 : 10,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setChangeReviewFocusedAnchorId(region.anchorId);
                            }}
                          >
                            <div className="flex items-center justify-between gap-2 text-[9px] text-slate-400">
                              <span
                                className={`rounded px-1 py-0.5 ${leftDiff ? 'bg-rose-100 text-rose-600' : ''}`}
                              >
                                {leftIndex !== null ? `L${leftIndex + 1}` : 'L–'}
                              </span>
                              <span
                                className={`rounded px-1 py-0.5 ${rightDiff ? 'bg-emerald-100 text-emerald-600' : ''}`}
                              >
                                {rightIndex !== null ? `R${rightIndex + 1}` : 'R–'}
                              </span>
                            </div>
                            <div className="mt-1 text-[10px] font-semibold text-slate-800">
                              {region.label}
                            </div>
                            <div className="mt-1 text-[10px] text-slate-600">{region.summary}</div>
                            {!thread &&
                              region.commentable &&
                              changeReviewDetail?.permissions.canAddThread && (
                                <div className="mt-2 grid gap-2">
                                  {changeReviewNewThreadAnchorId === region.anchorId ? (
                                    <>
                                      <textarea
                                        value={changeReviewNewThreadContent}
                                        onChange={(event) =>
                                          setChangeReviewNewThreadContent(event.target.value)
                                        }
                                        rows={3}
                                        placeholder="Write a review comment on this diff line"
                                        className="min-h-[72px] w-full rounded border border-sky-300 bg-white px-2 py-1 text-[10px] text-slate-900 placeholder-slate-400"
                                        disabled={changeReviewActionBusy}
                                      />
                                      <div className="flex justify-end gap-2">
                                        <button
                                          type="button"
                                          disabled={changeReviewActionBusy}
                                          className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700 disabled:opacity-50"
                                          onClick={() => {
                                            setChangeReviewNewThreadAnchorId(null);
                                            setChangeReviewNewThreadContent('');
                                          }}
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          disabled={
                                            changeReviewActionBusy ||
                                            !changeReviewNewThreadContent.trim()
                                          }
                                          className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700 disabled:opacity-50"
                                          onClick={() =>
                                            void createChangeReviewThread(
                                              region.anchorId,
                                              changeReviewNewThreadContent,
                                            )
                                          }
                                        >
                                          Submit
                                        </button>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="flex justify-end">
                                      <button
                                        type="button"
                                        disabled={changeReviewActionBusy}
                                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700 disabled:opacity-50"
                                        onClick={() => {
                                          setChangeReviewNewThreadAnchorId(region.anchorId);
                                          setChangeReviewNewThreadContent('');
                                        }}
                                      >
                                        Add Thread
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            {thread && renderChangeReviewThread(thread)}
                          </div>
                        );
                      })}
                      {changeReviewCompareBarsForGutter.map((bar) => {
                        const thread = changeReviewThreadsByAnchor.get(bar.anchorId);
                        const isFocused = changeReviewFocusedAnchorId === bar.anchorId;
                        const bounds =
                          bar.side === 'base'
                            ? compareLeftBounds[bar.measureIndex]
                            : compareRightBounds[bar.measureIndex];
                        const side = bar.side === 'base' ? ('left' as const) : ('right' as const);
                        const resolved = bounds
                          ? (resolvePartBounds?.(side, bar.measureIndex, bar.partIndex) ?? null)
                          : null;
                        const partHeight =
                          resolved?.height ??
                          (bounds ? bounds.height / comparePartCount : compareGutterRowHeight);
                        const blockTop =
                          resolved?.top ??
                          (bounds
                            ? bounds.top + (bounds.height / comparePartCount) * bar.partIndex
                            : compareHeaderSpacerHeight);
                        return (
                          <div
                            key={`compare-review-bar-${bar.anchorId}`}
                            ref={(el) => {
                              if (el) compareGutterRegionRefs.current.set(bar.anchorId, el);
                              else compareGutterRegionRefs.current.delete(bar.anchorId);
                            }}
                            className={`absolute left-0 right-0 cursor-pointer rounded border border-emerald-400 bg-white px-2 py-2 ${isFocused ? 'z-50 ring-2 ring-blue-400 shadow-raised' : 'z-20'}`}
                            style={{ top: `${blockTop}px`, minHeight: `${partHeight}px` }}
                            onClick={(event) => {
                              event.stopPropagation();
                              setChangeReviewFocusedAnchorId(bar.anchorId);
                            }}
                          >
                            <div className="flex items-center justify-between gap-2 text-[9px] text-slate-500">
                              <span className="rounded bg-emerald-100 px-1 py-0.5 text-emerald-700">
                                {bar.side === 'base' ? 'L' : 'R'}
                                {bar.measureIndex + 1}
                              </span>
                              <span>{bar.partName || `Part ${bar.partIndex + 1}`}</span>
                            </div>
                            <div className="mt-1 text-[10px] font-semibold text-slate-800">
                              {bar.label}
                            </div>
                            {!thread &&
                              isFocused &&
                              changeReviewDetail?.permissions.canAddThread && (
                                <div className="mt-2 grid gap-2">
                                  <textarea
                                    value={changeReviewNewThreadContent}
                                    onChange={(event) =>
                                      setChangeReviewNewThreadContent(event.target.value)
                                    }
                                    rows={3}
                                    autoFocus
                                    placeholder="Write a comment on this bar"
                                    className="min-h-[72px] w-full rounded border border-sky-300 bg-white px-2 py-1 text-[10px] text-slate-900 placeholder-slate-600"
                                    disabled={changeReviewActionBusy}
                                  />
                                  <div className="flex justify-end gap-2">
                                    <button
                                      type="button"
                                      disabled={changeReviewActionBusy}
                                      className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700 disabled:opacity-50"
                                      onClick={() => {
                                        setChangeReviewNewThreadAnchorId(null);
                                        setChangeReviewNewThreadContent('');
                                      }}
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      disabled={
                                        changeReviewActionBusy ||
                                        !changeReviewNewThreadContent.trim()
                                      }
                                      className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700 disabled:opacity-50"
                                      onClick={() =>
                                        void createChangeReviewThread(
                                          bar.anchorId,
                                          changeReviewNewThreadContent,
                                        )
                                      }
                                    >
                                      Submit
                                    </button>
                                  </div>
                                </div>
                              )}
                            {thread && renderChangeReviewThread(thread)}
                          </div>
                        );
                      })}
                    </div>
                  )}
                {!isChangeReviewCompareMode && blocks.length > 0 && (
                  <div
                    className="relative w-full"
                    style={{ height: `${compareGutterTrackHeight}px` }}
                  >
                    {blocks.map((block, blockIndex) => {
                      const blockRows = rows.slice(block.start, block.end + 1);
                      const leftIndices = blockRows
                        .map((row) => row.leftIndex)
                        .filter((value): value is number => value !== null);
                      const rightIndices = blockRows
                        .map((row) => row.rightIndex)
                        .filter((value): value is number => value !== null);
                      const leftStart = leftIndices[0];
                      const leftEnd = leftIndices[leftIndices.length - 1];
                      const rightStart = rightIndices[0];
                      const rightEnd = rightIndices[rightIndices.length - 1];
                      const leftLabel = leftIndices.length
                        ? `L${leftStart + 1}${leftEnd !== leftStart ? `–${leftEnd + 1}` : ''}`
                        : 'L–';
                      const rightLabel = rightIndices.length
                        ? `R${rightStart + 1}${rightEnd !== rightStart ? `–${rightEnd + 1}` : ''}`
                        : 'R–';
                      const measureStart = rightIndices.length ? rightStart : leftStart;
                      const measureEnd = rightIndices.length ? rightEnd : leftEnd;
                      const measureRange =
                        measureStart !== undefined
                          ? `${measureStart + 1}${measureEnd !== measureStart ? `-${measureEnd + 1}` : ''}`
                          : 'unknown';
                      const stableMeasureKey =
                        measureRange !== 'unknown'
                          ? measureRange
                          : `${blockIndex}:${leftStart ?? 'x'}:${leftEnd ?? 'x'}:${rightStart ?? 'x'}:${rightEnd ?? 'x'}`;
                      const blockKey = `${index}:${stableMeasureKey}`;
                      const aiBlock = {
                        partIndex: index,
                        blockIndex,
                        blockKey,
                        measureRange,
                        contentSignature: aiDiffBlockContentSignature(
                          compareSignatures,
                          index,
                          leftIndices,
                          rightIndices,
                        ),
                      };
                      const review = resolveAiDiffReview(aiBlock);
                      const reviewStatus = review?.status ?? 'pending';
                      const reviewComment = review?.comment ?? '';
                      const commentCommitted = Boolean(review?.commentCommitted);
                      const blockError = aiDiffBlockErrors[blockKey] ?? '';
                      const leftDiff = leftIndices.length > 0;
                      const rightDiff = rightIndices.length > 0;
                      const pairs = blockRows
                        .map((row) =>
                          row.leftIndex !== null && row.rightIndex !== null
                            ? { leftIndex: row.leftIndex, rightIndex: row.rightIndex }
                            : null,
                        )
                        .filter((pair): pair is { leftIndex: number; rightIndex: number } =>
                          Boolean(pair),
                        );
                      const canOverwrite = pairs.length > 0;
                      const blockLayouts = blockRows.flatMap((row, rowOffset) => {
                        const bounds: Array<{ top: number; height: number }> = [];
                        if (row.leftIndex !== null && compareLeftBounds[row.leftIndex]) {
                          bounds.push(compareLeftBounds[row.leftIndex]);
                        }
                        if (row.rightIndex !== null && compareRightBounds[row.rightIndex]) {
                          bounds.push(compareRightBounds[row.rightIndex]);
                        }
                        if (bounds.length === 0) {
                          const fallbackTop =
                            compareHeaderSpacerHeight +
                            (block.start + rowOffset) * compareGutterRowHeight;
                          return [{ top: fallbackTop, height: compareGutterRowHeight }];
                        }
                        return bounds;
                      });
                      let blockTop =
                        compareHeaderSpacerHeight + block.start * compareGutterRowHeight;
                      let blockHeight = (block.end - block.start + 1) * compareGutterRowHeight;
                      if (blockLayouts.length) {
                        const minTop = Math.min(...blockLayouts.map((item) => item.top));
                        const maxBottom = Math.max(
                          ...blockLayouts.map((item) => item.top + item.height),
                        );
                        blockTop = minTop;
                        blockHeight = Math.max(compareGutterRowHeight, maxBottom - minTop);
                      }
                      const blockComment = compareBlockComments[blockKey];
                      const hasComment = Boolean(blockComment?.comment.trim());
                      const isCommentFocused = compareFocusedBlockKey === blockKey;
                      return (
                        <div
                          key={`compare-gutter-block-${index}-${blockIndex}`}
                          className={`absolute left-0 right-0 rounded border bg-white px-2 py-2 ${
                            isAiCompareMode
                              ? reviewStatus === 'accepted'
                                ? 'border-emerald-300'
                                : reviewStatus === 'rejected'
                                  ? 'border-rose-300'
                                  : reviewStatus === 'comment'
                                    ? 'border-sky-300'
                                    : 'border-slate-200'
                              : hasComment
                                ? 'border-amber-400'
                                : 'border-slate-200'
                          }`}
                          style={{
                            top: `${blockTop}px`,
                            minHeight: `${blockHeight}px`,
                          }}
                        >
                          <div className="flex items-center justify-between text-[9px] text-slate-400">
                            <span
                              className={`rounded px-1 py-0.5 ${leftDiff ? 'bg-rose-100 text-rose-600' : ''}`}
                            >
                              {leftLabel}
                            </span>
                            <span
                              className={`rounded px-1 py-0.5 ${rightDiff ? 'bg-emerald-100 text-emerald-600' : ''} ${
                                isAiCompareMode && reviewStatus === 'accepted'
                                  ? 'line-through opacity-70'
                                  : ''
                              }`}
                            >
                              {rightLabel}
                            </span>
                          </div>
                          {!hosted && isAiCompareMode && (
                            <AiDiffBlockReview
                              review={{
                                status: reviewStatus,
                                comment: reviewComment,
                                commentCommitted,
                                error: blockError,
                              }}
                              disabled={{
                                apply:
                                  compareSwapBusy ||
                                  compareEditBusy ||
                                  compareAlignmentLoading ||
                                  !compareLeftScore ||
                                  !compareRightScoreDisplay ||
                                  !canOverwrite ||
                                  aiDiffFeedbackBusy ||
                                  Boolean(compareRightError),
                                feedback: aiDiffFeedbackBusy || compareAlignmentLoading,
                              }}
                              actions={{
                                apply: () => void handleAcceptAiDiffBlock(aiBlock, pairs),
                                reject: () => {
                                  setAiDiffBlockStatus(aiBlock, 'rejected');
                                  clearAiDiffBlockError(blockKey);
                                },
                                comment: () => {
                                  setAiDiffBlockStatus(aiBlock, 'comment');
                                  clearAiDiffBlockError(blockKey);
                                },
                                commitComment: () => commitAiDiffBlockComment(aiBlock),
                                editComment: () => editAiDiffBlockComment(aiBlock),
                              }}
                              bindTextarea={(element) =>
                                bindAiDiffCommentTextarea(blockKey, element)
                              }
                              onTextareaInput={() => handleAiDiffBlockCommentInput(aiBlock)}
                              resizeTextarea={handleAiDiffCommentResize}
                            />
                          )}
                          {!hosted && canOverwrite && !isAiCompareMode && (
                            <div className="mt-1 flex items-center justify-between gap-2">
                              <button
                                type="button"
                                disabled={
                                  compareSwapBusy ||
                                  compareEditBusy ||
                                  !compareLeftScore ||
                                  !compareRightScoreDisplay
                                }
                                className="flex h-6 w-10 items-center justify-center rounded border border-slate-200 bg-slate-100 text-[10px] text-slate-500 disabled:opacity-50"
                                aria-label={`Overwrite right with ${leftLabel}`}
                                onClick={() =>
                                  handleCompareOverwriteBlock(
                                    compareLeftScore,
                                    compareRightScoreDisplay,
                                    index,
                                    pairs,
                                  )
                                }
                              >
                                -&gt;
                              </button>
                              <button
                                type="button"
                                disabled={
                                  compareSwapBusy ||
                                  compareEditBusy ||
                                  !compareLeftScore ||
                                  !compareRightScoreDisplay
                                }
                                className="flex h-6 w-10 items-center justify-center rounded border border-slate-200 bg-slate-100 text-[10px] text-slate-500 disabled:opacity-50"
                                aria-label={`Overwrite left with ${rightLabel}`}
                                onClick={() =>
                                  handleCompareOverwriteBlock(
                                    compareRightScoreDisplay,
                                    compareLeftScore,
                                    index,
                                    pairs.map((pair) => ({
                                      leftIndex: pair.rightIndex,
                                      rightIndex: pair.leftIndex,
                                    })),
                                  )
                                }
                              >
                                &lt;-
                              </button>
                            </div>
                          )}
                          {!isAiCompareMode && (
                            <div className="mt-1 grid gap-1">
                              {hasComment && !isCommentFocused ? (
                                <div className="grid gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-700">
                                      Note
                                    </span>
                                    <button
                                      type="button"
                                      className="text-[9px] text-amber-600 hover:text-amber-800"
                                      onClick={() => setCompareFocusedBlockKey(blockKey)}
                                    >
                                      Edit
                                    </button>
                                  </div>
                                  <div className="whitespace-pre-wrap text-[10px] text-amber-900">
                                    {blockComment.comment}
                                  </div>
                                  <div className="flex justify-end">
                                    <button
                                      type="button"
                                      className="text-[9px] text-slate-400 hover:text-rose-600"
                                      onClick={() =>
                                        setCompareBlockComments((prev) => {
                                          const next = { ...prev };
                                          delete next[blockKey];
                                          return next;
                                        })
                                      }
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              ) : isCommentFocused ? (
                                <>
                                  <textarea
                                    autoFocus
                                    defaultValue={blockComment?.comment ?? ''}
                                    placeholder="Add a note about this difference…"
                                    rows={3}
                                    className="min-h-[60px] w-full rounded border border-amber-300 bg-white px-2 py-1 text-[10px] text-slate-900 placeholder-slate-400"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Escape') setCompareFocusedBlockKey(null);
                                    }}
                                    onChange={(e) => {
                                      const text = e.target.value;
                                      setCompareBlockComments((prev) => ({
                                        ...prev,
                                        [blockKey]: {
                                          comment: text,
                                          leftIndices,
                                          rightIndices,
                                        },
                                      }));
                                    }}
                                  />
                                  <div className="flex justify-end gap-2">
                                    <button
                                      type="button"
                                      className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700"
                                      onClick={() => setCompareFocusedBlockKey(null)}
                                    >
                                      Done
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500 hover:border-amber-300 hover:text-amber-700"
                                    onClick={() => setCompareFocusedBlockKey(blockKey)}
                                  >
                                    + Note
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
    </>
  );
}
