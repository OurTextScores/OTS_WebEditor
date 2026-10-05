import { useUndoHistory } from '../useUndoHistory';
import { layoutOracleEnabled, verifyFullLayout } from '../../../lib/layout-oracle';
import { startPerf } from '../../../lib/perf-trace';
import { Score } from '../../../lib/webmscore-loader';
import { announce, describeEdit } from '../../shell/announcer';
import { notify, notifyError } from '../../shell/notices';
import { ENGINE_OPERATION_STALL_RELEASE_MS } from '../layout-constants';
import { type MutationMethods } from '../mutation-api';
import {
  ELEMENT_SELECTION_SELECTOR,
  hasTextElementClass,
  normalizeElementClasses,
} from '../selection-classes';
import { type SelectionBox } from '../selection-types';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefreshPageCount, RenderScore } from '../editor-types';
import type { NoteInputCursorRect } from '../selection-types';
import type { MutableRefObject } from 'react';

/** Values defined after the hook is called; ScoreEditor assigns them on every render, before any event or effect can read them. */
export type EditorCoreLateInputs = {
  interactiveMutationEnabled: boolean;
  playSelectionPreview: (
    trigger?: string,
    selectionPoint?: { page: number; x: number; y: number },
    options?: { reselect?: boolean },
  ) => Promise<void>;
  refreshNoteInputCursor: (targetScore?: Score | null) => Promise<NoteInputCursorRect | null>;
};

export type EditorCoreContext = {
  refreshPageCount: RefreshPageCount;
  renderScore: RenderScore;
  lateInputs: MutableRefObject<EditorCoreLateInputs>;
};

/**
 * The editor core: the score session (the score, its serial operation queue, page, zoom and dirty flags), the selection model (selection state, the overlay and the sync into the engine) and the mutation pipeline (performMutation, requireMutation). Everything else in the editor reaches the engine through this.
 */
export function useEditorCore(ctx: EditorCoreContext) {
  const { refreshPageCount, renderScore, lateInputs } = ctx;

  const [score, setScore] = useState<Score | null>(null);
  const undoHistory = useUndoHistory(score);
  const touchHistory = undoHistory.touch;
  useEffect(() => {
    document.addEventListener('pointerup', touchHistory);
    document.addEventListener('keyup', touchHistory);
    return () => {
      document.removeEventListener('pointerup', touchHistory);
      document.removeEventListener('keyup', touchHistory);
    };
  }, [touchHistory]);

  const scoreRef = useRef<Score | null>(null);

  const [zoom, setZoom] = useState(1.0);

  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedElement, setSelectedElement] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  const [selectedPoint, setSelectedPoint] = useState<{ page: number; x: number; y: number } | null>(
    null,
  );

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const [selectionBoxes, setSelectionBoxes] = useState<SelectionBox[]>([]);

  const [overlaySuppressed, setOverlaySuppressed] = useState(false);

  const [selectedElementClasses, setSelectedElementClasses] = useState<string>('');

  const [selectedLayoutBreakSubtype, setSelectedLayoutBreakSubtype] = useState<
    'line' | 'page' | null
  >(null);

  const [textEditorPosition, setTextEditorPosition] = useState<{ x: number; y: number } | null>(
    null,
  );

  const noteInputActiveRef = useRef(false);

  const blockOverlayRefreshRef = useRef(false);

  const selectionOverlayGenerationRef = useRef(0);

  const [scoreDirtySinceCheckpoint, setScoreDirtySinceCheckpoint] = useState(false);

  const [scoreDirtySinceXml, setScoreDirtySinceXml] = useState(false);

  const [currentPage, setCurrentPage] = useState(0);

  const currentPageRef = useRef(currentPage);

  // False means libmscore already owns the authoritative selection. The only
  // normal path that moves the overlay without moving the engine is letter-key
  // pitch replacement outside note-input mode, which deliberately previews the
  // next note. Its next selection-dependent command must project that point once.
  const selectionProjectionNeededRef = useRef(false);

  const scoreOperationQueueRef = useRef<Promise<void>>(Promise.resolve());

  const runSerializedScoreOperation = useCallback(
    async <T>(operation: () => Promise<T>, label: string): Promise<T> => {
      const waitForPriorOperation = scoreOperationQueueRef.current;
      let releaseQueueSlot: (() => void) | null = null;
      scoreOperationQueueRef.current = new Promise<void>((resolve) => {
        releaseQueueSlot = resolve;
      });

      await waitForPriorOperation;

      let released = false;
      const release = () => {
        if (released) {
          return;
        }
        released = true;
        releaseQueueSlot?.();
      };

      const operationPromise = Promise.resolve().then(operation);
      const forceReleaseTimer = setTimeout(() => {
        console.warn(`[engine-queue] force release after ${ENGINE_OPERATION_STALL_RELEASE_MS}ms`, {
          label,
        });
        release();
      }, ENGINE_OPERATION_STALL_RELEASE_MS);

      try {
        return await operationPromise;
      } finally {
        clearTimeout(forceReleaseTimer);
        release();
      }
    },
    [],
  );

  const ensureSelectionInWasm = async () => {
    // If the UI is tracking multiple selected elements, avoid collapsing the WASM selection back to a single point.
    if (selectionBoxes.length > 1) {
      return;
    }
    if (!score || !selectedPoint) {
      return;
    }
    // A range selection cannot be reconstructed from a single point, so
    // re-projecting the UI's selection into the engine would destroy it. Box count
    // is not a usable proxy for this: a range renders as one rectangle per system,
    // so a single-system range legitimately has exactly one box and would otherwise
    // fall through to selectElementAtPoint below and collapse to one note. Ask the
    // engine what it is actually holding.
    try {
      if (score.isSelectionRange && (await score.isSelectionRange())) {
        return;
      }
    } catch {
      // Older build without the export: fall through to the point re-select.
    }

    try {
      const { page, x, y } = selectedPoint;
      const containerRect = containerRef.current?.getBoundingClientRect();
      const engravingPoint = containerRect
        ? clientToEngravingPoint(containerRect.left + x * zoom, containerRect.top + y * zoom)
        : null;
      const selectionX = engravingPoint?.x ?? x;
      const selectionY = engravingPoint?.y ?? y;
      const preferTextSelection =
        hasTextElementClass(selectedElementClasses) || Boolean(textEditorPosition);
      if (preferTextSelection && score.selectTextElementAtPoint) {
        const selected = await score.selectTextElementAtPoint(page, selectionX, selectionY);
        if (selected !== false) {
          selectionProjectionNeededRef.current = false;
        }
        return;
      }
      if (!score.selectElementAtPoint) {
        return;
      }
      const selected = await score.selectElementAtPoint(page, selectionX, selectionY);
      if (selected !== false) {
        selectionProjectionNeededRef.current = false;
      }
    } catch (err) {
      console.warn('Re-select in WASM failed; continuing anyway', err);
    }
  };

  const refreshSelectionOverlay = (
    fallbackIndex?: number | null,
    fallbackPoint?: { page: number; x: number; y: number } | null,
    generation?: number,
  ) => {
    if (!containerRef.current) {
      return;
    }
    if (generation !== undefined && generation !== selectionOverlayGenerationRef.current) {
      return;
    }
    if (blockOverlayRefreshRef.current) {
      return;
    }
    const useIndex = fallbackIndex !== undefined ? fallbackIndex : selectedIndex;
    const usePoint = fallbackPoint !== undefined ? fallbackPoint : selectedPoint;
    const containerRect = containerRef.current.getBoundingClientRect();
    const selectors = ['.selected', '.note-selected', '.ms-selection'];
    const candidates: Element[] = Array.from(
      new Set(selectors.flatMap((sel) => Array.from(containerRef.current!.querySelectorAll(sel)))),
    );
    const allElements = Array.from(
      containerRef.current.querySelectorAll(ELEMENT_SELECTION_SELECTOR),
    );

    let boxes: SelectionBox[] = [];
    if (candidates.length > 0) {
      boxes = candidates
        .map((cand) => {
          const rect = cand.getBoundingClientRect();
          const x = (rect.left - containerRect.left) / zoom;
          const y = (rect.top - containerRect.top) / zoom;
          const w = rect.width / zoom;
          const h = rect.height / zoom;
          if (!(w > 0 && h > 0)) {
            return null;
          }
          const page = resolvePageIndex(cand);
          const centerX = x + w / 2;
          const centerY = y + h / 2;
          const classAttr = normalizeElementClasses(cand, cand.getAttribute('class') ?? '');

          let idx = allElements.indexOf(cand);
          if (idx < 0) {
            let current: Element | null = cand;
            while (current && current !== containerRef.current) {
              idx = allElements.indexOf(current);
              if (idx >= 0) break;
              current = current.parentElement;
            }
          }

          return {
            index: idx >= 0 ? idx : null,
            page,
            x,
            y,
            w,
            h,
            centerX,
            centerY,
            classes: classAttr,
          } satisfies SelectionBox;
        })
        .filter((box): box is NonNullable<typeof box> => Boolean(box))
        .sort(
          (a, b) =>
            a.page - b.page ||
            a.y - b.y ||
            a.x - b.x ||
            (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER),
        );
    } else if (useIndex !== null) {
      // Fallback: use index if selection markers are missing in SVG
      const el = allElements[useIndex] ?? null;
      if (el) {
        const rect = el.getBoundingClientRect();
        const x = (rect.left - containerRect.left) / zoom;
        const y = (rect.top - containerRect.top) / zoom;
        const w = rect.width / zoom;
        const h = rect.height / zoom;
        if (w > 0 && h > 0) {
          const page = resolvePageIndex(el);
          const centerX = x + w / 2;
          const centerY = y + h / 2;
          const fallbackClass = el.getAttribute('class') ?? '';
          boxes = [
            {
              index: useIndex,
              page,
              x,
              y,
              w,
              h,
              centerX,
              centerY,
              classes: fallbackClass,
            },
          ];
        }
      } else {
      }
    }

    if (boxes.length === 0) {
      setSelectionBoxes([]);
      setSelectedElement(null);
      setSelectedPoint(null);
      setSelectedIndex(null);
      setSelectedElementClasses('');
      setSelectedLayoutBreakSubtype(null);
      return;
    }

    setSelectionBoxes(boxes);

    let primary: SelectionBox | null = null;
    if (usePoint) {
      const targetPage = usePoint.page ?? currentPageRef.current;
      const samePage = boxes.filter((box) => box.page === targetPage);
      const pool = samePage.length > 0 ? samePage : boxes;
      primary = pool.reduce(
        (best, box) => {
          if (!best) return box;
          const bestDist = Math.hypot(best.centerX - usePoint.x, best.centerY - usePoint.y);
          const dist = Math.hypot(box.centerX - usePoint.x, box.centerY - usePoint.y);
          return dist < bestDist ? box : best;
        },
        null as SelectionBox | null,
      );
    } else if (useIndex !== null) {
      primary = boxes.find((box) => box.index === useIndex) ?? boxes[0];
    } else {
      primary = boxes[0];
    }

    if (!primary) {
      return;
    }

    setSelectedElement({ x: primary.x, y: primary.y, w: primary.w, h: primary.h });
    setSelectedPoint({ page: primary.page, x: primary.centerX, y: primary.centerY });
    setSelectedIndex(primary.index);
    setSelectedElementClasses(primary.classes ?? '');
  };

  const advanceSelectionOverlay = (
    startIndex?: number | null,
    startPoint?: { page: number; x: number; y: number } | null,
    step: number = 1,
  ) => {
    if (!containerRef.current) {
      return;
    }
    const allElements = Array.from(
      containerRef.current.querySelectorAll(ELEMENT_SELECTION_SELECTOR),
    );
    if (allElements.length === 0) {
      return;
    }

    let index = startIndex ?? selectedIndex;
    const fallbackPoint =
      startPoint ??
      selectedPoint ??
      (selectedElement
        ? {
            page: 0,
            x: selectedElement.x + selectedElement.w / 2,
            y: selectedElement.y + selectedElement.h / 2,
          }
        : null);
    if (fallbackPoint) {
      const containerRect = containerRef.current.getBoundingClientRect();
      index = allElements.reduce((bestIdx, el, idx) => {
        const rect = el.getBoundingClientRect();
        const centerX = (rect.left - containerRect.left + rect.width / 2) / zoom;
        const centerY = (rect.top - containerRect.top + rect.height / 2) / zoom;
        const bestRect = allElements[bestIdx]?.getBoundingClientRect();
        const bestCenterX = bestRect
          ? (bestRect.left - containerRect.left + bestRect.width / 2) / zoom
          : centerX;
        const bestCenterY = bestRect
          ? (bestRect.top - containerRect.top + bestRect.height / 2) / zoom
          : centerY;
        const bestDist = Math.hypot(bestCenterX - fallbackPoint.x, bestCenterY - fallbackPoint.y);
        const dist = Math.hypot(centerX - fallbackPoint.x, centerY - fallbackPoint.y);
        return dist < bestDist ? idx : bestIdx;
      }, 0);
    }

    const baseIndex = index ?? 0;
    const nextIndex = Math.min(allElements.length - 1, Math.max(0, baseIndex + step));
    const target = allElements[nextIndex];
    if (!target) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const x = (rect.left - containerRect.left) / zoom;
    const y = (rect.top - containerRect.top) / zoom;
    const w = rect.width / zoom;
    const h = rect.height / zoom;
    if (!(w > 0 && h > 0)) {
      return;
    }
    const page = resolvePageIndex(target);
    const centerX = x + w / 2;
    const centerY = y + h / 2;
    const box: SelectionBox = {
      index: nextIndex,
      page,
      x,
      y,
      w,
      h,
      centerX,
      centerY,
    };

    setSelectionBoxes([box]);
    setSelectedElement({ x, y, w, h });
    setSelectedPoint({ page, x: centerX, y: centerY });
    setSelectedIndex(nextIndex);
    selectionProjectionNeededRef.current = true;
  };

  const requireMutation = (methodName: keyof MutationMethods) => {
    const activeScore = scoreRef.current ?? score;
    const fn = activeScore && (activeScore as MutationMethods)[methodName];
    if (typeof fn !== 'function') {
      console.warn(`Mutation binding "${methodName}" is missing on Score instance.`);
      notifyError(`This build of webmscore does not expose "${methodName}".`);
      return null;
    }
    return (...args: unknown[]) => Reflect.apply(fn, activeScore, args);
  };

  const performMutation = async (
    label: string,
    action?: () => Promise<unknown> | unknown,
    options?: {
      clearSelection?: boolean;
      skipWasmReselect?: boolean;
      skipSelectionFallback?: boolean;
      skipRelayout?: boolean;
      /**
       * The engine call ends in `endCmd`, whose incremental layout is complete for this edit: the
       * layout oracle found no difference from a full relayout, across a sweep of fixtures and
       * selections. Only these edits skip the full relayout (~1.4 s on a 30-page score); every
       * other one still pays it. Add a label here only after the oracle has checked it.
       */
      incrementalLayout?: boolean;
      advanceSelection?: boolean;
      advanceSelectionStep?: number;
      playSelectionPreview?: boolean;
    },
  ) => {
    if (!score) {
      console.warn(`Mutation "${label}" requested but no score is loaded.`);
      return;
    }
    if (!lateInputs.current.interactiveMutationEnabled) {
      console.warn(`Mutation "${label}" skipped: interaction not ready.`);
      return;
    }
    if (!action) {
      console.warn(`Mutation "${label}" requested but binding is missing on Score instance.`);
      return;
    }

    // Preserve selection state before mutation for use in fallback
    const preservedIndex = selectedIndex;
    const preservedPoint = selectedPoint;
    // Both guards below exist to protect a selection richer than a single point --
    // originally measure selections, which used to render as one box per notehead.
    // A range now renders as one rectangle per system, so box count no longer
    // detects it and the engine has to be asked. Captured before the mutation,
    // while the caller's selection still exists.
    let preservedRangeSelection = false;
    try {
      preservedRangeSelection = Boolean(score.isSelectionRange && (await score.isSelectionRange()));
    } catch {
      // Older build without the export; fall back to the box-count heuristic.
    }
    const preservedMultiSelection = selectionBoxes.length > 1 || preservedRangeSelection;
    const allowSelectionFallback = !options?.skipSelectionFallback;
    const shouldPlaySelectionPreview = Boolean(options?.playSelectionPreview);

    const perf = startPerf(label);
    // Layout oracle (dev): skip the full relayout, then check afterwards whether it was needed.
    const oracle = layoutOracleEnabled() && !options?.skipRelayout;
    try {
      console.debug(`Mutation "${label}" start`);
      const result = await perf.time('mutation', action);
      // Read the engine's undo stack now that it has (maybe) changed.
      void undoHistory.refresh(label);
      console.debug(`Mutation "${label}" result:`, result);
      const mutated = result !== false;
      if (!mutated) {
        console.warn(`Mutation "${label}" returned false (no-op).`);
      }

      // Clear selection if requested (e.g., for delete operations)
      if (options?.clearSelection) {
        blockOverlayRefreshRef.current = true;
        selectionOverlayGenerationRef.current += 1;
        setOverlaySuppressed(true);
        setSelectedElement(null);
        setSelectionBoxes([]);
        setSelectedPoint(null);
        setSelectedIndex(null);
        setSelectedElementClasses('');
        setSelectedLayoutBreakSubtype(null);
        selectionProjectionNeededRef.current = false;
      }

      if (!mutated) {
        return;
      }
      if (options?.skipWasmReselect && !options.advanceSelection) {
        selectionProjectionNeededRef.current = false;
      }
      setScoreDirtySinceCheckpoint(true);
      setScoreDirtySinceXml(true);

      if (!options?.skipRelayout && !options?.incrementalLayout && !oracle && score.relayout) {
        try {
          await perf.time('relayout', () => score.relayout!());
        } catch (relayoutErr) {
          console.warn('Relayout after mutation failed:', relayoutErr);
        }
      }
      const refreshedPage = await perf.time('pageCount', () =>
        refreshPageCount(score, currentPageRef.current),
      );
      await renderScore(score, refreshedPage, true, perf);
      if (noteInputActiveRef.current) {
        await perf.time('noteInputCursor', () => lateInputs.current.refreshNoteInputCursor(score));
      }
      perf.end();
      announce(describeEdit(label));
      if (oracle) {
        await verifyFullLayout(score, label, refreshedPage, runSerializedScoreOperation, () =>
          renderScore(score, refreshedPage),
        );
      }

      // Re-establish selection inside WASM if we had a previously known point.
      if (
        !options?.skipWasmReselect &&
        !preservedMultiSelection &&
        preservedPoint &&
        score.selectElementAtPoint
      ) {
        try {
          await score.selectElementAtPoint(preservedPoint.page, preservedPoint.x, preservedPoint.y);
        } catch (reselectErr) {
          console.warn(
            'Re-select in WASM after mutation failed; continuing with overlay fallback',
            reselectErr,
          );
        }
      }

      // If selection wasn't cleared, restore preserved state for fallback
      if (!options?.clearSelection && allowSelectionFallback) {
        if (preservedIndex !== null && selectedIndex === null) {
          setSelectedIndex(preservedIndex);
        }
        if (preservedPoint && !selectedPoint) {
          setSelectedPoint(preservedPoint);
        }
      }

      if (options?.clearSelection) {
        return;
      }

      if (shouldPlaySelectionPreview) {
        // Re-projecting the pre-mutation point while entering notes moves
        // libmscore's InputState back to the chord just entered. The engine
        // already owns the advancing insertion cursor, so audition its current
        // selection without changing that cursor.
        void lateInputs.current.playSelectionPreview(
          `mutation:${label}`,
          preservedPoint ?? undefined,
          {
            // Mutations such as pitch changes and transposition keep their
            // selection inside libmscore. Re-selecting from the old SVG
            // point after relayout can hit staff lines because the note has
            // moved vertically, leaving the overlay and engine selection
            // out of sync.
            reselect: !noteInputActiveRef.current && !options?.skipWasmReselect,
          },
        );
      }

      // Schedule overlay refresh after the DOM has had time to update
      // Use a double-RAF to ensure the DOM is fully parsed and rendered
      // Pass preserved values to handle async state updates
      const fallbackIndex = allowSelectionFallback ? preservedIndex : null;
      const fallbackPoint = allowSelectionFallback ? preservedPoint : null;
      const advanceSelection = options?.advanceSelection;
      const advanceStep = options?.advanceSelectionStep ?? 1;

      // Skip overlay refresh for multi-selections (measure selections with backend highlighting)
      // These don't add .selected classes to DOM, so refreshSelectionOverlay would clear them
      if (preservedMultiSelection) {
        return;
      }

      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            if (advanceSelection) {
              advanceSelectionOverlay(preservedIndex, preservedPoint, advanceStep);
            } else {
              refreshSelectionOverlay(fallbackIndex, fallbackPoint);
            }
          });
        });
      } else {
        if (advanceSelection) {
          advanceSelectionOverlay(preservedIndex, preservedPoint, advanceStep);
        } else {
          refreshSelectionOverlay(fallbackIndex, fallbackPoint);
        }
      }
    } catch (err) {
      console.error(`Mutation "${label}" failed:`, err);
      notify({ kind: 'error', title: `Unable to ${label}`, detail: 'See the console.' });
    } finally {
      perf.end();
    }
  };

  const extractPageIndex = (element: Element | null): number | null => {
    let current: Element | null = element;
    while (current && current !== containerRef.current) {
      const dataPage = (current as HTMLElement).dataset?.page;
      if (dataPage && !Number.isNaN(Number(dataPage))) {
        const parsed = Number(dataPage);
        return parsed >= 0 ? parsed : null;
      }

      const idAttr = current.getAttribute('id');
      if (idAttr) {
        const match = idAttr.match(/page-?(\d+)/i);
        if (match) {
          const parsed = Number(match[1]);
          return Number.isNaN(parsed) ? null : Math.max(parsed - 1, 0);
        }
      }
      current = current.parentElement;
    }
    return null;
  };

  const resolvePageIndex = (element: Element | null): number => {
    const extracted = extractPageIndex(element);
    if (extracted === null) {
      return currentPageRef.current;
    }
    if (extracted === 0 && currentPageRef.current > 0) {
      return currentPageRef.current;
    }
    return extracted;
  };

  const scoreSvgForTarget = (target?: Element | null): SVGSVGElement | null => {
    const targetedSvg = target?.closest('svg');
    if (targetedSvg instanceof SVGSVGElement) {
      return targetedSvg;
    }
    return containerRef.current?.querySelector('svg') ?? null;
  };

  const clientToEngravingPoint = (clientX: number, clientY: number, target?: Element | null) => {
    const svg = scoreSvgForTarget(target);
    const matrix = svg && typeof svg.getScreenCTM === 'function' ? svg.getScreenCTM() : null;
    if (!matrix) {
      return null;
    }
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  };

  return {
    blockOverlayRefreshRef,
    clientToEngravingPoint,
    containerRef,
    currentPage,
    currentPageRef,
    ensureSelectionInWasm,
    noteInputActiveRef,
    overlaySuppressed,
    performMutation,
    refreshSelectionOverlay,
    requireMutation,
    resolvePageIndex,
    runSerializedScoreOperation,
    score,
    scoreDirtySinceCheckpoint,
    scoreDirtySinceXml,
    scoreRef,
    scoreSvgForTarget,
    selectedElement,
    selectedElementClasses,
    selectedIndex,
    selectedLayoutBreakSubtype,
    selectedPoint,
    selectionBoxes,
    selectionOverlayGenerationRef,
    selectionProjectionNeededRef,
    setCurrentPage,
    setOverlaySuppressed,
    setScore,
    setScoreDirtySinceCheckpoint,
    setScoreDirtySinceXml,
    setSelectedElement,
    setSelectedElementClasses,
    setSelectedIndex,
    setSelectedLayoutBreakSubtype,
    setSelectedPoint,
    setSelectionBoxes,
    setTextEditorPosition,
    setZoom,
    textEditorPosition,
    undoHistory,
    zoom,
  };
}

/** What the editor core returns: the one object that command modules take. */
export type EditorCore = ReturnType<typeof useEditorCore>;
