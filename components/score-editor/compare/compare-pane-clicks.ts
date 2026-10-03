import { type CompareScoreRole } from '../../../lib/compare-user-edit-diff';
import { Score } from '../../../lib/webmscore-loader';
import { notifyError } from '../../shell/notices';
import { buildMismatchBlocks } from '../alignment';
import { hitTestMeasure } from '../score-measures';
import { type SelectionBox } from '../selection-types';
import { type CompareSide } from './compare-types';
import React from 'react';
import type { Positions } from '../../../lib/webmscore-loader';
import type { NoteInputCursorRect } from '../selection-types';
import type { AiMeasureAnchor } from './CompareMeasureComments';
import type {
  ChangeReviewDetail,
  ChangeReviewDiff,
  ChangeReviewThread,
  PartAlignment,
} from './compare-types';
import type { CompareMutationOptions, RoleRecord } from './useCompareEditing';

export type CompareScoreClickContext = {
  compareLeftMeasurePositions: Positions | null;
  compareRightMeasurePositions: Positions | null;
  compareLeftWrapperRef: React.RefObject<HTMLDivElement | null>;
  compareRightWrapperRef: React.RefObject<HTMLDivElement | null>;
  compareEffectiveZoom: number;
  isChangeReviewCompareMode: boolean;
  compareSwapped: boolean;
  comparePartCount: number;
  changeReviewDiff: ChangeReviewDiff | null;
  changeReviewFocusedAnchorId: string | null;
  compareAlignmentByPart: Map<number, PartAlignment>;
  setCompareClickedMeasures: React.Dispatch<
    React.SetStateAction<{
      leftIndex: number | null;
      rightIndex: number | null;
      partIndex: number | null;
    } | null>
  >;
  setChangeReviewFocusedAnchorId: React.Dispatch<React.SetStateAction<string | null>>;
  changeReviewThreadsByAnchor: Map<string, ChangeReviewThread>;
  changeReviewDetail: ChangeReviewDetail | null;
  setChangeReviewNewThreadAnchorId: React.Dispatch<React.SetStateAction<string | null>>;
  setChangeReviewNewThreadContent: React.Dispatch<React.SetStateAction<string>>;
  compareGutterRegionRefs: React.RefObject<Map<string, HTMLDivElement>>;
  isAiCompareMode: boolean;
  setAiFocusedMeasureAnchor: React.Dispatch<React.SetStateAction<AiMeasureAnchor | null>>;
  setAiMeasureThreadDraft: React.Dispatch<React.SetStateAction<string>>;
  setCompareFocusedBlockKey: React.Dispatch<React.SetStateAction<string | null>>;
};

export type ComparePaneClickContext = {
  compareLeftScore: Score | null;
  compareRightScoreDisplay: Score | null;
  compareLeftMeasurePositions: Positions | null;
  compareRightMeasurePositions: Positions | null;
  compareLeftWrapperRef: React.RefObject<HTMLDivElement | null>;
  compareRightWrapperRef: React.RefObject<HTMLDivElement | null>;
  setCompareActiveSide: React.Dispatch<React.SetStateAction<CompareSide | null>>;
  isCompareEditBusy: () => boolean;
  compareSwapBusy: boolean;
  aiDiffFeedbackBusy: boolean;
  getCompareScoreRole: (targetScore: Score) => CompareScoreRole;
  compareEffectiveZoom: number;
  getCompareTargetPage: (targetScore: Score | null) => number;
  compareContinuousMode: boolean;
  isCompareNoteInputCommitted: (role: CompareScoreRole) => boolean;
  performCompareMutation: (
    label: string,
    action: (targetScore: Score) => Promise<unknown> | unknown,
    options?: CompareMutationOptions,
  ) => Promise<boolean>;
  setCompareHasSelection: (role: CompareScoreRole, selected: boolean) => void;
  handleCompareScoreClick: (
    event: React.MouseEvent<HTMLDivElement>,
    side: 'left' | 'right',
  ) => void;
  compareHasSelectionByRole: RoleRecord<boolean>;
  invalidateCompareOperations: (invalidateQueuedKeyboard?: boolean) => number;
  trackCompareOperation: <T>(operation: Promise<T>) => Promise<T>;
  runSerializedScoreOperation: <T>(operation: () => Promise<T>, label: string) => Promise<T>;
  isCompareGenerationCurrent: (generation: number) => boolean;
  renderEditedCompareScore: (
    targetScore: Score,
    side: CompareSide,
    highlightSelection?: boolean,
  ) => Promise<void>;
  refreshCompareSelectionGeometry: (
    targetScore: Score,
    role: CompareScoreRole,
    side: CompareSide,
    selected?: boolean,
    isCurrent?: () => boolean,
  ) => Promise<SelectionBox[]>;
};

export type RefreshCompareSelectionGeometryContext = {
  setCompareSelection: (role: CompareScoreRole, boxes: SelectionBox[], selected?: boolean) => void;
  runSerializedScoreOperation: <T>(operation: () => Promise<T>, label: string) => Promise<T>;
  compareLeftContainerRef: React.RefObject<HTMLDivElement | null>;
  compareRightContainerRef: React.RefObject<HTMLDivElement | null>;
  getCompareTargetPage: (targetScore: Score | null) => number;
  compareEffectiveZoom: number;
  compareContinuousMode: boolean;
};

export type SetCompareNoteInputModeContext = {
  compareScoreForSide: (side: CompareSide | null) => Score | null;
  isCompareEditBusy: () => boolean;
  compareSwapBusy: boolean;
  aiDiffFeedbackBusy: boolean;
  invalidateCompareOperations: (invalidateQueuedKeyboard?: boolean) => number;
  setCompareActiveSide: React.Dispatch<React.SetStateAction<CompareSide | null>>;
  getCompareScoreRole: (targetScore: Score) => CompareScoreRole;
  requestCompareNoteInput: (role: CompareScoreRole, enabled: boolean) => void;
  trackCompareOperation: <T>(operation: Promise<T>) => Promise<T>;
  runSerializedScoreOperation: <T>(operation: () => Promise<T>, label: string) => Promise<T>;
  isCompareGenerationCurrent: (generation: number) => boolean;
  rollbackCompareNoteInputRequest: (role: CompareScoreRole) => void;
  commitCompareNoteInput: (role: CompareScoreRole, enabled: boolean) => void;
  refreshCompareNoteInputCursor: (
    targetScore: Score,
    role: CompareScoreRole,
    side: CompareSide,
    isCurrent?: () => boolean,
  ) => Promise<NoteInputCursorRect | null>;
  setCompareNoteInputCursor: (role: CompareScoreRole, cursor: NoteInputCursorRect | null) => void;
};

export function compareScoreClick(
  ctx: CompareScoreClickContext,
  event: React.MouseEvent<HTMLDivElement>,
  side: 'left' | 'right',
) {
  const {
    compareLeftMeasurePositions,
    compareRightMeasurePositions,
    compareLeftWrapperRef,
    compareRightWrapperRef,
    compareEffectiveZoom,
    isChangeReviewCompareMode,
    compareSwapped,
    comparePartCount,
    changeReviewDiff,
    changeReviewFocusedAnchorId,
    compareAlignmentByPart,
    setCompareClickedMeasures,
    setChangeReviewFocusedAnchorId,
    changeReviewThreadsByAnchor,
    changeReviewDetail,
    setChangeReviewNewThreadAnchorId,
    setChangeReviewNewThreadContent,
    compareGutterRegionRefs,
    isAiCompareMode,
    setAiFocusedMeasureAnchor,
    setAiMeasureThreadDraft,
    setCompareFocusedBlockKey,
  } = ctx;
  const positions = side === 'left' ? compareLeftMeasurePositions : compareRightMeasurePositions;
  const wrapperRef = side === 'left' ? compareLeftWrapperRef : compareRightWrapperRef;
  const measureIndex = hitTestMeasure(
    positions,
    event.clientX,
    event.clientY,
    wrapperRef,
    compareEffectiveZoom,
  );
  if (measureIndex < 0) return;

  if (isChangeReviewCompareMode) {
    const crSide = compareSwapped
      ? side === 'left'
        ? 'head'
        : 'base'
      : side === 'left'
        ? 'base'
        : 'head';
    let clickedPartIndex = 0;
    if (comparePartCount > 1 && wrapperRef.current && positions) {
      const el = positions.elements[measureIndex];
      if (el) {
        const h = typeof el.sy === 'number' ? el.sy : (el.height ?? 0);
        const pageHeight = positions.pageSize?.height ?? 0;
        const needsPageOffset = pageHeight > 0 && el.page > 0 && el.y + h <= pageHeight * 1.2;
        const pageOffset = needsPageOffset ? el.page * pageHeight : 0;
        const rect = wrapperRef.current.getBoundingClientRect();
        const scoreY = (event.clientY - rect.top) / compareEffectiveZoom;
        const relativeY = scoreY - (el.y + pageOffset);
        clickedPartIndex = Math.min(
          Math.max(Math.floor((relativeY / h) * comparePartCount), 0),
          comparePartCount - 1,
        );
      }
    }
    const region = changeReviewDiff?.scoreRegions.find(
      (r) =>
        r.partIndex === clickedPartIndex &&
        (crSide === 'base'
          ? r.baseMeasureIndex === measureIndex
          : r.headMeasureIndex === measureIndex),
    );
    const bar = changeReviewDiff?.bars.find(
      (candidate) =>
        candidate.side === crSide &&
        candidate.partIndex === clickedPartIndex &&
        candidate.measureIndex === measureIndex,
    );
    const nextAnchorId = region?.anchorId ?? bar?.anchorId;
    if (!nextAnchorId) return;
    const toggling = changeReviewFocusedAnchorId === nextAnchorId;

    // Compute the measure indices for the blue highlight on both sides
    let leftIndex: number | null = null;
    let rightIndex: number | null = null;
    const focusedPartIndex: number | null = region?.partIndex ?? bar?.partIndex ?? clickedPartIndex;
    if (!toggling) {
      if (region) {
        const baseIdx = region.baseMeasureIndex ?? null;
        const headIdx = region.headMeasureIndex ?? null;
        leftIndex = compareSwapped ? headIdx : baseIdx;
        rightIndex = compareSwapped ? baseIdx : headIdx;
      } else {
        // Unchanged bar: use alignment to find the partner index
        leftIndex = side === 'left' ? measureIndex : null;
        rightIndex = side === 'right' ? measureIndex : null;
        const alignment = compareAlignmentByPart.get(clickedPartIndex);
        if (alignment) {
          for (const row of alignment.rows) {
            const rowIdx = side === 'left' ? row.leftIndex : row.rightIndex;
            if (rowIdx === measureIndex) {
              leftIndex = row.leftIndex ?? null;
              rightIndex = row.rightIndex ?? null;
              break;
            }
          }
        }
      }
    }

    setCompareClickedMeasures(
      toggling ? null : { leftIndex, rightIndex, partIndex: focusedPartIndex },
    );
    setChangeReviewFocusedAnchorId(toggling ? null : nextAnchorId);

    if (!toggling) {
      const existingThread = changeReviewThreadsByAnchor.get(nextAnchorId);
      if (!existingThread && changeReviewDetail?.permissions.canAddThread) {
        setChangeReviewNewThreadAnchorId(nextAnchorId);
        setChangeReviewNewThreadContent('');
      } else {
        setChangeReviewNewThreadAnchorId(null);
        setChangeReviewNewThreadContent('');
      }
      requestAnimationFrame(() => {
        compareGutterRegionRefs.current
          .get(nextAnchorId)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
    return;
  }

  if (isAiCompareMode) {
    // Anchor an ephemeral measure-level thread at the clicked measure (toggle on repeat).
    let clickedPartIndex = 0;
    if (comparePartCount > 1 && wrapperRef.current && positions) {
      const el = positions.elements[measureIndex];
      if (el) {
        const h = typeof el.sy === 'number' ? el.sy : (el.height ?? 0);
        const pageHeight = positions.pageSize?.height ?? 0;
        const needsPageOffset = pageHeight > 0 && el.page > 0 && el.y + h <= pageHeight * 1.2;
        const pageOffset = needsPageOffset ? el.page * pageHeight : 0;
        const rect = wrapperRef.current.getBoundingClientRect();
        const scoreY = (event.clientY - rect.top) / compareEffectiveZoom;
        const relativeY = scoreY - (el.y + pageOffset);
        clickedPartIndex = Math.min(
          Math.max(Math.floor((relativeY / h) * comparePartCount), 0),
          comparePartCount - 1,
        );
      }
    }
    let leftIndex: number | null = side === 'left' ? measureIndex : null;
    let rightIndex: number | null = side === 'right' ? measureIndex : null;
    const alignment = compareAlignmentByPart.get(clickedPartIndex);
    if (alignment) {
      for (const row of alignment.rows) {
        const rowIdx = side === 'left' ? row.leftIndex : row.rightIndex;
        if (rowIdx === measureIndex) {
          leftIndex = row.leftIndex ?? null;
          rightIndex = row.rightIndex ?? null;
          break;
        }
      }
    }
    // Anchor on the base/current (left) measure number so it matches the numbering the
    // AI uses in its patch/annotations (which target the current XML). Falls back to the
    // proposal index only for inserted measures that have no base counterpart.
    const measureNumber = (leftIndex ?? rightIndex ?? measureIndex) + 1;
    const key = `${clickedPartIndex}:m${measureNumber}`;
    setAiFocusedMeasureAnchor((prev) =>
      prev?.key === key
        ? null
        : { key, partIndex: clickedPartIndex, measureNumber, leftIndex, rightIndex },
    );
    setAiMeasureThreadDraft('');
    return;
  }

  // Plain compare mode: focus the gutter block that contains this measure
  for (const [partIndex, alignment] of compareAlignmentByPart) {
    const blocks = buildMismatchBlocks(alignment.rows);
    for (let bi = 0; bi < blocks.length; bi++) {
      const block = blocks[bi];
      const rows = alignment.rows.slice(block.start, block.end + 1);
      const indices = rows
        .map((r) => (side === 'left' ? r.leftIndex : r.rightIndex))
        .filter((v): v is number => v !== null);
      if (!indices.includes(measureIndex)) continue;
      const rightIndices = rows.map((r) => r.rightIndex).filter((v): v is number => v !== null);
      const leftIndices = rows.map((r) => r.leftIndex).filter((v): v is number => v !== null);
      const rStart = rightIndices[0];
      const rEnd = rightIndices[rightIndices.length - 1];
      const lStart = leftIndices[0];
      const lEnd = leftIndices[leftIndices.length - 1];
      const primaryStart = rightIndices.length ? rStart : lStart;
      const primaryEnd = rightIndices.length ? rEnd : lEnd;
      const measureRange =
        primaryStart !== undefined
          ? `${primaryStart + 1}${primaryEnd !== primaryStart ? `-${primaryEnd + 1}` : ''}`
          : `${bi}:${lStart ?? 'x'}:${lEnd ?? 'x'}:${rStart ?? 'x'}:${rEnd ?? 'x'}`;
      const blockKey = `${partIndex}:${measureRange}`;
      setCompareFocusedBlockKey((prev) => (prev === blockKey ? null : blockKey));
      return;
    }
  }
}

export function comparePaneClick(
  ctx: ComparePaneClickContext,
  event: React.MouseEvent<HTMLDivElement>,
  side: 'left' | 'right',
) {
  const {
    compareLeftScore,
    compareRightScoreDisplay,
    compareLeftMeasurePositions,
    compareRightMeasurePositions,
    compareLeftWrapperRef,
    compareRightWrapperRef,
    setCompareActiveSide,
    isCompareEditBusy,
    compareSwapBusy,
    aiDiffFeedbackBusy,
    getCompareScoreRole,
    compareEffectiveZoom,
    getCompareTargetPage,
    compareContinuousMode,
    isCompareNoteInputCommitted,
    performCompareMutation,
    setCompareHasSelection,
    handleCompareScoreClick,
    compareHasSelectionByRole,
    invalidateCompareOperations,
    trackCompareOperation,
    runSerializedScoreOperation,
    isCompareGenerationCurrent,
    renderEditedCompareScore,
    refreshCompareSelectionGeometry,
  } = ctx;
  const targetScore = side === 'left' ? compareLeftScore : compareRightScoreDisplay;
  const positions = side === 'left' ? compareLeftMeasurePositions : compareRightMeasurePositions;
  const wrapper = side === 'left' ? compareLeftWrapperRef.current : compareRightWrapperRef.current;
  if (!targetScore || !positions || !wrapper) {
    return;
  }
  setCompareActiveSide(side);
  if (isCompareEditBusy() || compareSwapBusy || aiDiffFeedbackBusy) {
    return;
  }
  const role = getCompareScoreRole(targetScore);
  const measureIndex = hitTestMeasure(
    positions,
    event.clientX,
    event.clientY,
    side === 'left' ? compareLeftWrapperRef : compareRightWrapperRef,
    compareEffectiveZoom,
  );
  const measure = measureIndex >= 0 ? positions.elements[measureIndex] : null;
  const rect = wrapper.getBoundingClientRect();
  const x = (event.clientX - rect.left) / compareEffectiveZoom;
  const absoluteY = (event.clientY - rect.top) / compareEffectiveZoom;
  const pageHeight = positions.pageSize?.height ?? 0;
  const legacyMeasureHeight = measure
    ? (measure as unknown as Record<string, unknown>).height
    : null;
  const rawMeasureHeight = measure
    ? typeof measure.sy === 'number'
      ? measure.sy
      : typeof legacyMeasureHeight === 'number'
        ? legacyMeasureHeight
        : 0
    : 0;
  const usesPageOffset = Boolean(
    measure &&
    pageHeight > 0 &&
    measure.page > 0 &&
    measure.y + rawMeasureHeight <= pageHeight * 1.2,
  );
  const renderedPage = getCompareTargetPage(targetScore);
  const page = compareContinuousMode ? (measure?.page ?? renderedPage) : renderedPage;
  const y = compareContinuousMode && usesPageOffset ? absoluteY - page * pageHeight : absoluteY;

  if (isCompareNoteInputCommitted(role)) {
    void performCompareMutation(
      'place a note',
      async (activeScore) => {
        if (!activeScore.putNote) {
          notifyError('This build of webmscore does not expose "putNote".');
          return false;
        }
        const result = await activeScore.putNote(page, x, y);
        if (result !== false) {
          setCompareHasSelection(role, true);
        }
        return result;
      },
      { side },
    );
    return;
  }

  handleCompareScoreClick(event, side);
  if (!targetScore.selectElementAtPoint && !targetScore.selectElementAtPointWithMode) {
    return;
  }
  const hasExistingSelection = compareHasSelectionByRole[role];
  const selectionMode: 0 | 2 | 3 =
    event.ctrlKey || event.metaKey ? 2 : event.shiftKey && hasExistingSelection ? 3 : 0;
  const generation = invalidateCompareOperations();
  const selectionOperation = trackCompareOperation(
    runSerializedScoreOperation(
      () =>
        Promise.resolve(
          targetScore.selectElementAtPointWithMode
            ? targetScore.selectElementAtPointWithMode(page, x, y, selectionMode)
            : targetScore.selectElementAtPoint!(page, x, y),
        ),
      `compare-select:${side}`,
    ).then(async (selected) => {
      if (!isCompareGenerationCurrent(generation)) {
        return;
      }
      if (selected === false && selectionMode === 0 && targetScore.clearSelection) {
        await runSerializedScoreOperation(
          () => Promise.resolve(targetScore.clearSelection!()),
          `compare-selection-clear:${side}`,
        );
      }
      await renderEditedCompareScore(targetScore, side, true);
      if (!isCompareGenerationCurrent(generation)) {
        return;
      }
      await refreshCompareSelectionGeometry(targetScore, role, side, selected !== false, () =>
        isCompareGenerationCurrent(generation),
      );
    }),
  );
  void selectionOperation.catch((err) => {
    if (!isCompareGenerationCurrent(generation)) {
      return;
    }
    console.warn('Failed to select an element in compare score:', err);
  });
}

export async function refreshCompareSelectionGeometryImpl(
  ctx: RefreshCompareSelectionGeometryContext,
  targetScore: Score,
  role: CompareScoreRole,
  side: CompareSide,
  selected?: boolean,
  isCurrent?: () => boolean,
) {
  const {
    setCompareSelection,
    runSerializedScoreOperation,
    compareLeftContainerRef,
    compareRightContainerRef,
    getCompareTargetPage,
    compareEffectiveZoom,
    compareContinuousMode,
  } = ctx;
  if (isCurrent && !isCurrent()) {
    return [] as SelectionBox[];
  }
  if (selected === false) {
    setCompareSelection(role, [], false);
    return [] as SelectionBox[];
  }

  const hasGeometryBinding = Boolean(
    targetScore.getSelectionBoundingBoxes || targetScore.getSelectionBoundingBox,
  );
  let rawBoxes: Array<{
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];
  try {
    if (targetScore.getSelectionBoundingBoxes) {
      const result = await runSerializedScoreOperation(
        () => Promise.resolve(targetScore.getSelectionBoundingBoxes!()),
        `compare-selection-boxes:${side}`,
      );
      rawBoxes = Array.isArray(result) ? result : [];
    }
    if (rawBoxes.length === 0 && targetScore.getSelectionBoundingBox) {
      const result = await runSerializedScoreOperation(
        () => Promise.resolve(targetScore.getSelectionBoundingBox!()),
        `compare-selection-box:${side}`,
      );
      if (result) {
        rawBoxes = [result];
      }
    }
  } catch (err) {
    console.warn(`Failed to read ${side} compare selection geometry:`, err);
  }

  let boxes: SelectionBox[] = rawBoxes
    .filter(
      (box) =>
        Number.isFinite(box.x) &&
        Number.isFinite(box.y) &&
        Number.isFinite(box.width) &&
        Number.isFinite(box.height) &&
        box.width > 0 &&
        box.height > 0,
    )
    .map((box, index) => ({
      index,
      page: box.page,
      x: box.x,
      y: box.y,
      w: box.width,
      h: box.height,
      centerX: box.x + box.width / 2,
      centerY: box.y + box.height / 2,
      classes: '',
    }));

  // Older bindings may expose selection in the highlighted SVG without a
  // bounding-box method. Mirror the main editor's DOM fallback so a selected
  // note still gets the same blue interaction rectangle.
  if (boxes.length === 0) {
    const container =
      side === 'left' ? compareLeftContainerRef.current : compareRightContainerRef.current;
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const candidates = Array.from(
        new Set(
          ['.selected', '.note-selected', '.ms-selection'].flatMap((selector) =>
            Array.from(container.querySelectorAll(selector)),
          ),
        ),
      );
      const page = getCompareTargetPage(targetScore);
      boxes = candidates
        .map((candidate, index): SelectionBox | null => {
          const rect = candidate.getBoundingClientRect();
          const x = (rect.left - containerRect.left) / compareEffectiveZoom;
          const y = (rect.top - containerRect.top) / compareEffectiveZoom;
          const w = rect.width / compareEffectiveZoom;
          const h = rect.height / compareEffectiveZoom;
          if (!(w > 0 && h > 0)) {
            return null;
          }
          return {
            index,
            page,
            x,
            y,
            w,
            h,
            centerX: x + w / 2,
            centerY: y + h / 2,
            classes: candidate.getAttribute('class') ?? '',
          };
        })
        .filter((box): box is SelectionBox => Boolean(box));
    }
  }

  const targetPage = getCompareTargetPage(targetScore);
  const visibleBoxes = compareContinuousMode
    ? boxes
    : boxes.filter((box) => box.page === targetPage);
  if (isCurrent && !isCurrent()) {
    return [] as SelectionBox[];
  }
  setCompareSelection(
    role,
    visibleBoxes,
    boxes.length > 0 || (selected === true && !hasGeometryBinding),
  );
  return visibleBoxes;
}

export async function setCompareNoteInputModeImpl(
  ctx: SetCompareNoteInputModeContext,
  enabled: boolean,
  side: CompareSide,
) {
  const {
    compareScoreForSide,
    isCompareEditBusy,
    compareSwapBusy,
    aiDiffFeedbackBusy,
    invalidateCompareOperations,
    setCompareActiveSide,
    getCompareScoreRole,
    requestCompareNoteInput,
    trackCompareOperation,
    runSerializedScoreOperation,
    isCompareGenerationCurrent,
    rollbackCompareNoteInputRequest,
    commitCompareNoteInput,
    refreshCompareNoteInputCursor,
    setCompareNoteInputCursor,
  } = ctx;
  const targetScore = compareScoreForSide(side);
  if (
    !targetScore?.setNoteEntryMode ||
    isCompareEditBusy() ||
    compareSwapBusy ||
    aiDiffFeedbackBusy
  ) {
    return;
  }
  const generation = invalidateCompareOperations();
  setCompareActiveSide(side);
  const role = getCompareScoreRole(targetScore);
  requestCompareNoteInput(role, enabled);
  const operation = trackCompareOperation(
    (async () => {
      if (enabled && targetScore.setInputStateFromSelection) {
        await runSerializedScoreOperation(
          () => Promise.resolve(targetScore.setInputStateFromSelection!()),
          `compare-note-input-selection:${side}`,
        ).catch(() => {});
        if (!isCompareGenerationCurrent(generation)) {
          return;
        }
      }
      const changed = await runSerializedScoreOperation(
        () => Promise.resolve(targetScore.setNoteEntryMode!(enabled)),
        `compare-note-input:${side}`,
      );
      if (!isCompareGenerationCurrent(generation)) {
        return;
      }
      if (changed === false) {
        rollbackCompareNoteInputRequest(role);
        return;
      }
      commitCompareNoteInput(role, enabled);
      if (enabled) {
        await refreshCompareNoteInputCursor(targetScore, role, side, () =>
          isCompareGenerationCurrent(generation),
        );
      } else {
        setCompareNoteInputCursor(role, null);
      }
    })(),
  );
  try {
    await operation;
  } catch (err) {
    if (isCompareGenerationCurrent(generation)) {
      rollbackCompareNoteInputRequest(role);
      console.warn('Failed to toggle compare note input mode:', err);
    }
  }
}
