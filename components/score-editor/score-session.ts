import { type EditorLaunchContext } from '../../lib/editor-launch-context';
import { resolveScoreEditorApiPath } from '../../lib/score-editor-api-client';
import { InputFileFormat, Score } from '../../lib/webmscore-loader';
import { AI_SELECTION_BOX_CONTEXT_LIMIT, AI_SELECTION_CONTEXT_MAX_CHARS } from './ai-constants';
import { truncateAiContext } from './ai-prompts';
import { runWithTimeout } from './async-timeout';
import {
  LARGE_SCORE_BACKGROUND_TASK_DELAY_MS,
  LARGE_SCORE_BACKGROUND_TASK_MAX_RETRIES,
  LARGE_SCORE_BACKGROUND_TASK_RETRY_DELAY_MS,
  PROGRESSIVE_PAGE_LAYOUT_CONFIRM_TIMEOUT_MS,
  PROGRESSIVE_PAGE_LAYOUT_EXPAND_TIMEOUT_MS,
  PROGRESSIVE_PAGE_LAYOUT_TIMEOUT_MS,
} from './layout-constants';
import { type SelectionGeometryBox } from './selection-types';
import type { LayoutProgressState } from '../../lib/webmscore-loader';
import type { EnsureSoundFontLoaded, RenderScore } from './editor-types';
import type { SelectionBox } from './selection-types';
import type React from 'react';

export type BackgroundInitContext = {
  clearScheduledBackgroundInit: () => void;
  scoreRef: React.RefObject<Score | null>;
  backgroundInitTimerRef: React.RefObject<NodeJS.Timeout | null>;
  interactionPreparingRef: React.RefObject<boolean>;
  pageNavigationInFlightRef: React.RefObject<boolean>;
  progressivePageLoadInFlightRef: React.RefObject<boolean>;
  refreshScoreMetadata: (currentScore: Score) => Promise<void>;
  refreshInstrumentTemplates: (currentScore: Score) => Promise<void>;
  ensureSoundFontLoaded: EnsureSoundFontLoaded;
  createInitialLoadCheckpoint: (loadedScore: Score, preferredScoreId?: string) => Promise<void>;
  prefetchSoundFontBytes: () => Promise<{ url: string; buf: Uint8Array } | null>;
};

export type EnsurePageLaidOutContext = {
  pageCount: number;
  progressivePageLoadInFlightRef: React.RefObject<boolean>;
  runSerializedScoreOperation: <T>(operation: () => Promise<T>, label: string) => Promise<T>;
  setPageCount: React.Dispatch<React.SetStateAction<number>>;
  requestLayoutProgress: (targetScore: Score, targetPage: number) => Promise<LayoutProgressState>;
  setProgressiveHasMorePages: React.Dispatch<React.SetStateAction<boolean>>;
};

export type OpenScoreSessionContext = {
  isSyncingRef: React.RefObject<boolean>;
  scoreSessionId: string | null;
  scoreRevision: number;
  resolveXmlContext: () => Promise<string>;
  lastSyncedXmlRef: React.RefObject<string>;
  lastSyncedRevisionRef: React.RefObject<number>;
  activeLaunchContext: EditorLaunchContext | null;
  setScoreSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setScoreRevision: React.Dispatch<React.SetStateAction<number>>;
};

export type GoToPageContext = {
  score: Score | null;
  pageNavigationInFlightRef: React.RefObject<boolean>;
  currentPageRef: React.RefObject<number>;
  pageCount: number;
  largeScoreSessionRef: React.RefObject<boolean>;
  progressivePagingActive: boolean;
  progressiveHasMorePages: boolean;
  ensurePageIsLaidOut: (targetScore: Score, targetPage: number) => Promise<boolean>;
  runSerializedScoreOperation: <T>(operation: () => Promise<T>, label: string) => Promise<T>;
  setPageCount: React.Dispatch<React.SetStateAction<number>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  renderScore: RenderScore;
  refreshSelectionOverlay: (
    fallbackIndex?: number | null,
    fallbackPoint?: { page: number; x: number; y: number } | null,
    generation?: number,
  ) => void;
  selectedIndex: number | null;
  selectedPoint: { page: number; x: number; y: number } | null;
};

export type ResolveSelectionContext = {
  selectedPointRef: React.RefObject<{ page: number; x: number; y: number } | null>;
  selectedElementClasses: string;
  selectionBoxes: SelectionBox[];
  selectedElement: { x: number; y: number; w: number; h: number } | null;
  selectedIndex: number | null;
  currentPageRef: React.RefObject<number>;
  scoreRef: React.RefObject<Score | null>;
  score: Score | null;
  runSerializedScoreOperation: <T>(operation: () => Promise<T>, label: string) => Promise<T>;
};

export function scheduleBackgroundInitTasksImpl(
  ctx: BackgroundInitContext,
  loadedScore: Score,
  options: {
    format: InputFileFormat;
    inputByteLength: number;
    isLargeInput: boolean;
    progressivePaging: boolean;
    createInitialCheckpoint?: boolean;
    checkpointScoreId?: string;
    logStage?: (stage: string, extra?: unknown) => void;
  },
) {
  const {
    clearScheduledBackgroundInit,
    scoreRef,
    backgroundInitTimerRef,
    interactionPreparingRef,
    pageNavigationInFlightRef,
    progressivePageLoadInFlightRef,
    refreshScoreMetadata,
    refreshInstrumentTemplates,
    ensureSoundFontLoaded,
    createInitialLoadCheckpoint,
    prefetchSoundFontBytes,
  } = ctx;
  const {
    format,
    inputByteLength,
    isLargeInput,
    progressivePaging,
    createInitialCheckpoint,
    checkpointScoreId,
    logStage,
  } = options;

  const log = (stage: string, extra?: unknown) => {
    if (!logStage) {
      return;
    }
    logStage(stage, extra);
  };

  clearScheduledBackgroundInit();

  const runTasks = async (attempt: number) => {
    if (scoreRef.current !== loadedScore) {
      backgroundInitTimerRef.current = null;
      return;
    }
    if (isLargeInput && interactionPreparingRef.current) {
      backgroundInitTimerRef.current = setTimeout(() => {
        void runTasks(attempt);
      }, 1000);
      log('background-tasks:deferred', { reason: 'interaction-preparing', attempt });
      return;
    }
    if (
      isLargeInput &&
      (pageNavigationInFlightRef.current || progressivePageLoadInFlightRef.current)
    ) {
      if (attempt >= LARGE_SCORE_BACKGROUND_TASK_MAX_RETRIES) {
        log('background-tasks:skipped', { reason: 'busy-navigation', attempts: attempt });
        backgroundInitTimerRef.current = null;
        return;
      }
      backgroundInitTimerRef.current = setTimeout(() => {
        void runTasks(attempt + 1);
      }, LARGE_SCORE_BACKGROUND_TASK_RETRY_DELAY_MS);
      return;
    }

    backgroundInitTimerRef.current = null;
    log('background-tasks:start', { attempt });

    log('refresh-metadata:start');
    try {
      await runWithTimeout(refreshScoreMetadata(loadedScore), 20_000, 'Score metadata refresh');
      log('refresh-metadata:done');
    } catch (err) {
      log('refresh-metadata:failed', err);
      console.warn('Background score metadata refresh timed out or failed.', err);
    }

    log('refresh-instruments:start');
    try {
      await runWithTimeout(
        refreshInstrumentTemplates(loadedScore),
        20_000,
        'Instrument template refresh',
      );
      log('refresh-instruments:done');
    } catch (err) {
      log('refresh-instruments:failed', err);
      console.warn('Background instrument template refresh timed out or failed.', err);
    }

    if (loadedScore.saveAudio) {
      log('soundfont:start');
      try {
        await runWithTimeout(ensureSoundFontLoaded(loadedScore), 25_000, 'SoundFont load');
        log('soundfont:done');
      } catch (err) {
        log('soundfont:failed', err);
        console.warn('Background SoundFont load timed out or failed.', err);
      }
    }

    if (createInitialCheckpoint) {
      log('checkpoint:start');
      try {
        await runWithTimeout(
          createInitialLoadCheckpoint(loadedScore, checkpointScoreId),
          20_000,
          'Initial checkpoint creation',
        );
        log('checkpoint:done');
      } catch (err) {
        log('checkpoint:failed', err);
        console.warn('Background initial checkpoint creation timed out or failed.', err);
      }
    }
  };

  if (loadedScore.saveAudio) {
    if (isLargeInput && interactionPreparingRef.current) {
      log('soundfont:warmup-deferred', { reason: 'interaction-preparing' });
      queueMicrotask(() => {
        void prefetchSoundFontBytes().catch((err) => {
          log('soundfont:warmup-prefetch-failed', err);
          console.warn('Background SoundFont prefetch failed.', err);
        });
      });
    } else {
      log('soundfont:warmup-scheduled');
      queueMicrotask(() => {
        void ensureSoundFontLoaded(loadedScore).catch((err) => {
          log('soundfont:warmup-failed', err);
          console.warn('Background SoundFont warmup failed.', err);
        });
      });
    }
  }

  if (isLargeInput) {
    log('background-tasks:deferred', {
      reason: 'large-upload',
      bytes: inputByteLength,
      format,
      progressivePaging,
      delayMs: LARGE_SCORE_BACKGROUND_TASK_DELAY_MS,
    });
    backgroundInitTimerRef.current = setTimeout(() => {
      void runTasks(0);
    }, LARGE_SCORE_BACKGROUND_TASK_DELAY_MS);
    return;
  }

  void runTasks(0);
}

export async function ensurePageIsLaidOutImpl(
  ctx: EnsurePageLaidOutContext,
  targetScore: Score,
  targetPage: number,
): Promise<boolean> {
  const {
    pageCount,
    progressivePageLoadInFlightRef,
    runSerializedScoreOperation,
    setPageCount,
    requestLayoutProgress,
    setProgressiveHasMorePages,
  } = ctx;
  if (!targetScore.layoutUntilPage && !targetScore.layoutUntilPageState) {
    return targetPage < pageCount;
  }
  if (progressivePageLoadInFlightRef.current) {
    return false;
  }

  progressivePageLoadInFlightRef.current = true;
  try {
    const isExpandingBeyondKnownPages = targetPage >= pageCount;
    if (isExpandingBeyondKnownPages && targetScore.layoutUntilPage) {
      // For expansion into unknown pages, call layoutUntilPage directly.
      // layoutUntilPageState can stall for very large scores when advancing.
      const expanded = Boolean(
        await runWithTimeout(
          runSerializedScoreOperation(
            () => Promise.resolve(targetScore.layoutUntilPage!(targetPage)),
            `layoutUntilPage(page=${targetPage + 1})`,
          ),
          PROGRESSIVE_PAGE_LAYOUT_EXPAND_TIMEOUT_MS,
          `Expand layout to page ${targetPage + 1}`,
        ),
      );
      if (targetScore.npages) {
        const pages = Math.max(
          1,
          await runSerializedScoreOperation(() => Promise.resolve(targetScore.npages!()), 'npages'),
        );
        setPageCount((prev) => Math.max(prev, pages));
        if (expanded && pages > targetPage) {
          return true;
        }
      } else if (expanded) {
        setPageCount((prev) => Math.max(prev, targetPage + 1));
        return true;
      }
    }

    const layoutState = await runWithTimeout(
      requestLayoutProgress(targetScore, targetPage),
      PROGRESSIVE_PAGE_LAYOUT_TIMEOUT_MS,
      `Layout state for page ${targetPage + 1}`,
    );
    const pages = Math.max(1, layoutState.availablePages || 1);
    setPageCount((prev) => Math.max(prev, pages));
    setProgressiveHasMorePages(layoutState.hasMorePages);

    let targetSatisfied = layoutState.targetSatisfied;
    if (targetSatisfied && targetScore.layoutUntilPage && targetPage > 0) {
      // Confirm the target page is fully materialized before rendering it.
      // layoutUntilPageState can report optimistic availability on very large scores.
      targetSatisfied = Boolean(
        await runWithTimeout(
          runSerializedScoreOperation(
            () => Promise.resolve(targetScore.layoutUntilPage!(targetPage)),
            `layoutUntilPage(page=${targetPage + 1})`,
          ),
          PROGRESSIVE_PAGE_LAYOUT_CONFIRM_TIMEOUT_MS,
          `Layout page ${targetPage + 1}`,
        ),
      );
    }

    if (!targetSatisfied || pages <= targetPage) {
      return false;
    }

    return true;
  } catch (err) {
    console.warn('Failed incremental page layout:', err);
    if (targetPage < pageCount) {
      // If page count already claims this page exists, allow a best-effort render attempt.
      return true;
    }
    setProgressiveHasMorePages(false);
    return false;
  } finally {
    progressivePageLoadInFlightRef.current = false;
  }
}

export async function openScoreSessionImpl(ctx: OpenScoreSessionContext, xml?: string) {
  const {
    isSyncingRef,
    scoreSessionId,
    scoreRevision,
    resolveXmlContext,
    lastSyncedXmlRef,
    lastSyncedRevisionRef,
    activeLaunchContext,
    setScoreSessionId,
    setScoreRevision,
  } = ctx;
  if (isSyncingRef.current) {
    return { scoreSessionId, revision: scoreRevision };
  }

  let nextSessionId = scoreSessionId;
  let nextRevision = scoreRevision;
  try {
    const content = xml || (await resolveXmlContext());
    if (!content.trim()) {
      return { scoreSessionId: nextSessionId, revision: nextRevision };
    }

    // Skip if content and revision haven't changed since last successful sync
    if (content === lastSyncedXmlRef.current && scoreRevision === lastSyncedRevisionRef.current) {
      return { scoreSessionId: nextSessionId, revision: nextRevision };
    }

    isSyncingRef.current = true;
    const isSync = Boolean(scoreSessionId);
    const endpoint = isSync ? '/api/music/scoreops/sync' : '/api/music/scoreops/session/open';
    const body: {
      content: string;
      scoreMeta?: { launchContext: EditorLaunchContext };
      scoreSessionId?: string;
      baseRevision?: number;
    } = { content };
    if (activeLaunchContext) {
      body.scoreMeta = {
        launchContext: activeLaunchContext,
      };
    }
    if (scoreSessionId) {
      body.scoreSessionId = scoreSessionId;
      body.baseRevision = scoreRevision;
    }

    const response = await fetch(resolveScoreEditorApiPath(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.ok) {
      const result = await response.json();
      if (result.scoreSessionId) {
        setScoreSessionId(result.scoreSessionId);
        const nextRev = result.newRevision ?? result.revision ?? 0;
        setScoreRevision(nextRev);
        lastSyncedXmlRef.current = content;
        lastSyncedRevisionRef.current = nextRev;
        nextSessionId = result.scoreSessionId;
        nextRevision = nextRev;
        console.info(
          `[session] ${isSync ? 'Synced' : 'Opened'} score session: ${result.scoreSessionId}, revision: ${nextRev}`,
        );
      }
    }
  } catch (err) {
    console.warn('[session] Failed to open/sync score session:', err);
  } finally {
    isSyncingRef.current = false;
  }
  return { scoreSessionId: nextSessionId, revision: nextRevision };
}

export async function goToPageImpl(ctx: GoToPageContext, targetPage: number) {
  const {
    score,
    pageNavigationInFlightRef,
    currentPageRef,
    pageCount,
    largeScoreSessionRef,
    progressivePagingActive,
    progressiveHasMorePages,
    ensurePageIsLaidOut,
    runSerializedScoreOperation,
    setPageCount,
    setCurrentPage,
    renderScore,
    refreshSelectionOverlay,
    selectedIndex,
    selectedPoint,
  } = ctx;
  if (!score || targetPage < 0) {
    return;
  }
  if (pageNavigationInFlightRef.current) {
    return;
  }
  pageNavigationInFlightRef.current = true;
  const previousPage = currentPageRef.current;
  let knownPages = pageCount;
  try {
    if (largeScoreSessionRef.current) {
      console.info('[large-nav] goToPage:start', {
        targetPage,
        knownPages: pageCount,
        progressivePagingActive,
        progressiveHasMorePages,
      });
    }
    if (progressivePagingActive && targetPage >= pageCount) {
      if (largeScoreSessionRef.current) {
        console.info('[large-nav] layout:ensure:start', { targetPage });
      }
      const ready = await ensurePageIsLaidOut(score, targetPage);
      if (!ready) {
        if (largeScoreSessionRef.current) {
          console.info('[large-nav] goToPage:not-ready', { targetPage });
        }
        return;
      }
      if (largeScoreSessionRef.current) {
        console.info('[large-nav] layout:ensure:done', { targetPage });
      }
      if (score.npages) {
        knownPages = Math.max(
          1,
          await runSerializedScoreOperation(() => score.npages!(), 'npages'),
        );
        setPageCount((prev) => Math.max(prev, knownPages));
      } else {
        knownPages = Math.max(pageCount, targetPage + 1);
      }
    } else if (targetPage >= pageCount) {
      return;
    }

    const maxKnownPage = Math.max(knownPages - 1, 0);
    const clampedTarget = Math.min(targetPage, maxKnownPage);
    setCurrentPage(clampedTarget);
    if (largeScoreSessionRef.current) {
      console.info('[large-nav] render:start', { targetPage: clampedTarget });
    }
    let rendered = await renderScore(score, clampedTarget);
    if (!rendered && progressivePagingActive) {
      if (largeScoreSessionRef.current) {
        console.info('[large-nav] render:retry-layout:start', { targetPage: clampedTarget });
      }
      const readyAfterRetry = await ensurePageIsLaidOut(score, clampedTarget);
      if (readyAfterRetry) {
        rendered = await renderScore(score, clampedTarget);
      }
    }
    if (!rendered) {
      setCurrentPage(previousPage);
      if (largeScoreSessionRef.current) {
        console.info('[large-nav] render:failed', { targetPage: clampedTarget, previousPage });
      }
      return;
    }
    if (largeScoreSessionRef.current) {
      console.info('[large-nav] render:done', { targetPage: clampedTarget });
    }
    refreshSelectionOverlay(selectedIndex, selectedPoint);
  } catch (err) {
    console.error('Failed to change page:', err);
  } finally {
    pageNavigationInFlightRef.current = false;
  }
}

export async function resolveSelectionContextImpl(ctx: ResolveSelectionContext) {
  const {
    selectedPointRef,
    selectedElementClasses,
    selectionBoxes,
    selectedElement,
    selectedIndex,
    currentPageRef,
    scoreRef,
    score,
    runSerializedScoreOperation,
  } = ctx;
  const lines: string[] = [];
  const primaryPoint = selectedPointRef.current;
  if (primaryPoint) {
    lines.push(
      `Primary selection point: page=${primaryPoint.page + 1}, x=${primaryPoint.x.toFixed(2)}, y=${primaryPoint.y.toFixed(2)}`,
    );
  }
  const classList = selectedElementClasses.trim();
  if (classList) {
    lines.push(`Primary selection classes: ${classList}`);
  }

  const rawBoxes: SelectionGeometryBox[] = selectionBoxes.length
    ? selectionBoxes
    : selectedElement
      ? [
          {
            index: selectedIndex,
            page: primaryPoint?.page ?? currentPageRef.current ?? 0,
            x: selectedElement.x,
            y: selectedElement.y,
            w: selectedElement.w,
            h: selectedElement.h,
            classes: classList || 'unknown',
          },
        ]
      : [];

  const boxes = rawBoxes
    .map((box, index) => {
      const x = typeof box?.x === 'number' ? box.x : NaN;
      const y = typeof box?.y === 'number' ? box.y : NaN;
      const w =
        typeof box?.w === 'number' ? box.w : typeof box?.width === 'number' ? box.width : NaN;
      const h =
        typeof box?.h === 'number' ? box.h : typeof box?.height === 'number' ? box.height : NaN;
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(w) ||
        !Number.isFinite(h)
      ) {
        return null;
      }
      return {
        index: typeof box?.index === 'number' ? box.index : index,
        page:
          typeof box?.page === 'number'
            ? box.page
            : (primaryPoint?.page ?? currentPageRef.current ?? 0),
        x,
        y,
        w,
        h,
        classes: typeof box?.classes === 'string' && box.classes.trim() ? box.classes : 'n/a',
      };
    })
    .filter(
      (
        box,
      ): box is {
        index: number;
        page: number;
        x: number;
        y: number;
        w: number;
        h: number;
        classes: string;
      } => Boolean(box),
    );

  if (boxes.length) {
    const shown = boxes.slice(0, AI_SELECTION_BOX_CONTEXT_LIMIT);
    const selectionLines = shown.map(
      (box, index) =>
        `#${index + 1}: page=${box.page + 1}, x=${box.x.toFixed(2)}, y=${box.y.toFixed(2)}, w=${box.w.toFixed(2)}, h=${box.h.toFixed(2)}, index=${box.index ?? 'n/a'}, classes=${box.classes || 'n/a'}`,
    );
    lines.push(`Selection boxes (${boxes.length} total):\n${selectionLines.join('\n')}`);
    if (boxes.length > shown.length) {
      lines.push(`Selection boxes truncated to first ${shown.length} entries.`);
    }
  } else {
    lines.push('No active selection boxes.');
  }

  const activeScore = scoreRef.current ?? score;
  if (activeScore?.selectionMimeData) {
    try {
      const mimeData = await runSerializedScoreOperation(
        () => Promise.resolve(activeScore.selectionMimeData!()),
        'selectionMimeData(ai-context)',
      );
      if (mimeData instanceof Uint8Array && mimeData.byteLength > 0) {
        const decoded = new TextDecoder().decode(mimeData);
        if (decoded.trim()) {
          const truncated = truncateAiContext(decoded, AI_SELECTION_CONTEXT_MAX_CHARS);
          lines.push(
            `Selection MIME XML:\n${truncated.value}${
              truncated.truncated
                ? `\n[Selection MIME XML truncated from ${truncated.originalLength} characters.]`
                : ''
            }`,
          );
        }
      }
    } catch (err) {
      console.warn('Failed to capture selection MIME context for AI request:', err);
    }
  }

  return lines.join('\n\n').trim();
}
