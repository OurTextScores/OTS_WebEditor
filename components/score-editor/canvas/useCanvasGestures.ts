import { startPerf } from '../../../lib/perf-trace';
import { type GripEditInfo } from '../../../lib/webmscore-loader';
import { ESCAPE_PRIORITY, pushEscapeLayer } from '../../shell/keyboard/escapeLayers';
import {
  ELEMENT_SELECTION_SELECTOR,
  hasSelectableClass,
  isSvgTextElement,
  normalizeElementClasses,
  resolveTextElement,
} from '../selection-classes';
import { type SelectionBox, type SelectionFallback } from '../selection-types';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { RefreshPageCount, RenderScore } from '../editor-types';
import type { MutableRefObject } from 'react';
import type { EditorCore } from '../core';

/** Values defined after the hook is called; ScoreEditor assigns them on every render, before any event or effect can read them. */
export type CanvasGesturesLateInputs = {
  updateNoteInputShadow: (clientX: number, clientY: number, target: Element | null) => void;
  refreshScoreSpatium: () => Promise<void>;
  clearEditorSelection: () => void;
};

export type CanvasGesturesContext = {
  core: EditorCore;
  clientToScorePoint: (clientX: number, clientY: number) => { x: number; y: number } | null;
  ignoreNextClickRef: React.RefObject<boolean>;
  refreshPageCount: RefreshPageCount;
  renderScore: RenderScore;
  scheduleSelectionOverlayRefresh: (
    fallbackIndex?: number | null,
    fallbackPoint?: { page: number; x: number; y: number } | null,
    generation?: number,
  ) => void;
  playSelectionPreview: (
    trigger?: string,
    selectionPoint?: { page: number; x: number; y: number },
    options?: { reselect?: boolean },
  ) => Promise<void>;
  scoreSpatiumRef: React.RefObject<number | null>;
  engravingToOverlayPoint: (x: number, y: number) => { x: number; y: number };
  refreshSelectionFromSvg: (fallback?: SelectionFallback) => Promise<void>;
  interactionReady: boolean;
  interactiveMutationEnabled: boolean;
  handlePutNoteAtPoint: (page: number, x: number, y: number) => Promise<void>;
  setHasBackendHighlighting: React.Dispatch<React.SetStateAction<boolean>>;
  selectionInFlightRef: React.RefObject<Promise<unknown> | null>;
  gestureLateInputs: MutableRefObject<CanvasGesturesLateInputs>;
};

/**
 * The canvas gestures: click, pointer and mouse down/move/up, marquee selection, live note dragging and grip editing. It owns the gesture state and refs (the drag rectangle, pointer ids, the note-drag machinery, the grip edit) and returns the handlers the score canvas binds.
 */
export function useCanvasGestures(ctx: CanvasGesturesContext) {
  const {
    core,
    clientToScorePoint,
    ignoreNextClickRef,
    refreshPageCount,
    renderScore,
    scheduleSelectionOverlayRefresh,
    playSelectionPreview,
    scoreSpatiumRef,
    engravingToOverlayPoint,
    refreshSelectionFromSvg,
    interactionReady,
    interactiveMutationEnabled,
    handlePutNoteAtPoint,
    setHasBackendHighlighting,
    selectionInFlightRef,
    gestureLateInputs,
  } = ctx;

  const {
    clientToEngravingPoint,
    containerRef,
    currentPageRef,
    noteInputActiveRef,
    resolvePageIndex,
    score,
    scoreRef,
    selectedIndex,
    selectionBoxes,
    selectionOverlayGenerationRef,
    setScoreDirtySinceCheckpoint,
    setScoreDirtySinceXml,
    setSelectedElement,
    setSelectedElementClasses,
    setSelectedIndex,
    setSelectedLayoutBreakSubtype,
    setSelectedPoint,
    setSelectionBoxes,
    zoom,
  } = core;

  const [dragSelectionRect, setDragSelectionRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  const dragKindRef = useRef<'pointer' | 'mouse' | null>(null);

  const dragPointerIdRef = useRef<number | null>(null);

  const dragStartClientRef = useRef<{ x: number; y: number } | null>(null);

  const dragStartScoreRef = useRef<{ x: number; y: number } | null>(null);

  const dragAdditiveRef = useRef(false);

  const dragActiveRef = useRef(false);

  const sawPointerMoveRef = useRef(false);

  const lastSpannerPointerRef = useRef<{ time: number; clientX: number; clientY: number } | null>(
    null,
  );

  // Ghost-drag note repitch: candidate captured on pointer-down, gesture data once the
  // drag threshold is crossed, ghost box rendered as an overlay in score units.
  const [noteDragGhost, setNoteDragGhost] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    steps: number;
  } | null>(null);

  const noteDragCandidateRef = useRef<{
    page: number;
    noteBox: { x: number; y: number; w: number; h: number };
  } | null>(null);

  const noteDragRef = useRef<{
    page: number;
    startX: number;
    startY: number;
    noteBox: { x: number; y: number; w: number; h: number };
    halfStep: number;
  } | null>(null);

  const noteDragEngineBeginRef = useRef<Promise<boolean> | null>(null);

  const noteDragLiveUpdateRef = useRef<{
    drag: { page: number; startX: number; startY: number; halfStep: number };
    steps: number;
    modifiers: number;
  } | null>(null);

  const noteDragLiveInFlightRef = useRef<Promise<void> | null>(null);

  const noteDragLiveFrameRef = useRef<number | null>(null);

  const noteDragRenderedStepsRef = useRef<number | null>(null);

  const noteDragFinishingRef = useRef(false);

  // Removes the window-level listeners that drive an in-flight note drag; the gesture
  // must outlive the score wrapper because the staff can sit at its very edge.
  const noteDragCleanupRef = useRef<(() => void) | null>(null);

  const [gripEdit, setGripEdit] = useState<GripEditInfo | null>(null);

  const gripDragCleanupRef = useRef<(() => void) | null>(null);

  const closeGripEdit = useCallback(
    (commit: boolean) => {
      gripDragCleanupRef.current?.();
      gripDragCleanupRef.current = null;
      setGripEdit(null);
      if (score?.endGripEdit) {
        void Promise.resolve(score.endGripEdit(commit)).catch((err: unknown) => {
          console.warn('Ending grip edit failed:', err);
        });
      }
    },
    [score],
  );

  const beginGripEditAtPoint = async (pageIndex: number, x: number, y: number) => {
    if (!interactiveMutationEnabled || noteInputActiveRef.current || !score?.beginGripEdit) {
      return;
    }
    try {
      const edit = await Promise.resolve(score.beginGripEdit(pageIndex, x, y));
      setGripEdit(edit?.grips?.length ? edit : null);
    } catch (err) {
      console.warn('Starting grip edit failed:', err);
      setGripEdit(null);
    }
  };

  const handleGripPointerDown = (event: React.PointerEvent, gripIndex: number) => {
    if (event.button !== 0 || !score?.dragGrip || !score?.endGripEdit || !gripEdit) {
      return;
    }
    const grip = gripEdit.grips.find((item) => item.index === gripIndex);
    if (!grip?.draggable) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    gripDragCleanupRef.current?.();
    const pointerId = event.pointerId;
    const startClient = { x: event.clientX, y: event.clientY };
    const startEngraving = clientToEngravingPoint(event.clientX, event.clientY);
    const initial = gripEdit;

    const engravingDelta = (clientX: number, clientY: number) => {
      const current = clientToEngravingPoint(clientX, clientY);
      if (!startEngraving || !current) {
        return {
          dx: (clientX - startClient.x) / zoom,
          dy: (clientY - startClient.y) / zoom,
        };
      }
      return { dx: current.x - startEngraving.x, dy: current.y - startEngraving.y };
    };

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }
      const { dx, dy } = engravingDelta(moveEvent.clientX, moveEvent.clientY);
      setGripEdit({
        ...initial,
        grips: initial.grips.map((item) =>
          item.index === gripIndex ? { ...item, x: item.x + dx, y: item.y + dy } : item,
        ),
      });
      moveEvent.preventDefault();
    };

    const finish = async (upEvent: PointerEvent, commit: boolean) => {
      if (upEvent.pointerId !== pointerId) {
        return;
      }
      gripDragCleanupRef.current?.();
      gripDragCleanupRef.current = null;
      const { dx, dy } = engravingDelta(upEvent.clientX, upEvent.clientY);
      let committed = false;
      try {
        if (commit && (dx !== 0 || dy !== 0)) {
          const modifiers =
            (upEvent.shiftKey ? 1 : 0) | (upEvent.ctrlKey ? 2 : 0) | (upEvent.altKey ? 4 : 0);
          const updated = await Promise.resolve(score.dragGrip?.(gripIndex, dx, dy, modifiers));
          committed = Boolean(updated);
        }
        await Promise.resolve(score.endGripEdit?.(committed));
        setGripEdit(null);
        if (!committed) {
          return;
        }
        setScoreDirtySinceCheckpoint(true);
        setScoreDirtySinceXml(true);
        if (score.relayout) {
          await Promise.resolve(score.relayout());
        }
        const refreshedPage = await refreshPageCount(score, currentPageRef.current);
        await renderScore(score, refreshedPage);
        const selectionPoint = engravingToOverlayPoint(grip.x + dx, grip.y + dy);
        await refreshSelectionFromSvg({
          index: null,
          point: { page: initial.page, ...selectionPoint },
        });
      } catch (err) {
        console.error('Grip drag failed:', err);
        await Promise.resolve(score.endGripEdit?.(false)).catch(() => {});
        setGripEdit(null);
      }
    };

    const onUp = (upEvent: PointerEvent) => {
      void finish(upEvent, true);
    };
    const onCancel = (cancelEvent: PointerEvent) => {
      void finish(cancelEvent, false);
    };
    // Escape cancels the drag: it is the innermost layer until the pointer is released.
    const popEscape = pushEscapeLayer(ESCAPE_PRIORITY.gesture, () => {
      gripDragCleanupRef.current?.();
      gripDragCleanupRef.current = null;
      setGripEdit(null);
      void Promise.resolve(score.endGripEdit?.(false)).catch(() => {});
    });

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    gripDragCleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      popEscape();
    };
  };

  const boxesIntersect = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ) => a.x + a.w >= b.x && b.x + b.w >= a.x && a.y + a.h >= b.y && b.y + b.h >= a.y;

  const performDragSelection = async (
    rect: { x: number; y: number; w: number; h: number },
    additive: boolean,
  ): Promise<SelectionFallback> => {
    if (!containerRef.current || !score) {
      return null;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const allElements = Array.from(
      containerRef.current.querySelectorAll(ELEMENT_SELECTION_SELECTOR),
    );

    const hits = allElements
      .map((el, index) => {
        const elRect = el.getBoundingClientRect();
        const box = {
          x: (elRect.left - containerRect.left) / zoom,
          y: (elRect.top - containerRect.top) / zoom,
          w: elRect.width / zoom,
          h: elRect.height / zoom,
        };
        if (!(box.w > 0 && box.h > 0)) {
          return null;
        }
        if (!boxesIntersect(rect, box)) {
          return null;
        }
        const pageIndex = resolvePageIndex(el);
        const centerX = box.x + box.w / 2;
        const centerY = box.y + box.h / 2;
        const engravingPoint = clientToEngravingPoint(
          elRect.left + elRect.width / 2,
          elRect.top + elRect.height / 2,
          el,
        );
        const selectionX = engravingPoint?.x ?? centerX;
        const selectionY = engravingPoint?.y ?? centerY;
        return { el, index, pageIndex, box, centerX, centerY, selectionX, selectionY };
      })
      .filter((hit): hit is NonNullable<typeof hit> => Boolean(hit))
      .sort(
        (a, b) =>
          a.pageIndex - b.pageIndex || a.box.y - b.box.y || a.box.x - b.box.x || a.index - b.index,
      );

    if (hits.length === 0) {
      if (!additive) {
        setSelectedElement(null);
        setSelectionBoxes([]);
        setSelectedPoint(null);
        setSelectedIndex(null);
        setSelectedElementClasses('');
        setSelectedLayoutBreakSubtype(null);
        if (score.clearSelection) {
          await Promise.resolve(score.clearSelection()).catch((err: unknown) => {
            console.warn('clearSelection not available or failed:', err);
          });
        }
      }
      return null;
    }

    const first = hits[0];
    const hitBoxes: SelectionBox[] = hits.map((hit) => ({
      index: hit.index,
      page: hit.pageIndex,
      x: hit.box.x,
      y: hit.box.y,
      w: hit.box.w,
      h: hit.box.h,
      centerX: hit.centerX,
      centerY: hit.centerY,
      classes: hit.el.getAttribute('class') ?? '',
    }));
    if (additive) {
      setSelectionBoxes((prev) => {
        const seen = new Set<number>();
        for (const box of prev) {
          if (box.index !== null) {
            seen.add(box.index);
          }
        }
        const merged = [...prev];
        for (const box of hitBoxes) {
          if (box.index !== null && seen.has(box.index)) {
            continue;
          }
          if (box.index !== null) {
            seen.add(box.index);
          }
          merged.push(box);
        }
        return merged;
      });
    } else {
      setSelectionBoxes(hitBoxes);
    }
    setSelectedElement(first.box);
    setSelectedPoint({ page: first.pageIndex, x: first.centerX, y: first.centerY });
    setSelectedIndex(first.index);

    const fallback: SelectionFallback = {
      index: first.index,
      point: {
        page: first.pageIndex,
        x: first.centerX,
        y: first.centerY,
      },
    };

    if (score.selectElementAtPointWithMode) {
      // Check if any hits are notes - notes need RANGE selection for copy/paste to work
      const hasNotes = hits.some((hit) => {
        const classes = hit.el.getAttribute('class') ?? '';
        return classes.includes('Note');
      });

      const firstMode = additive ? 1 : 0;

      if (hasNotes && hits.length > 1) {
        // For notes, use RANGE selection (mode 3) to enable copy/paste
        // Find leftmost and rightmost hits (by x position) for proper time-based range
        let leftmost = hits[0];
        let rightmost = hits[0];
        for (const hit of hits) {
          if (hit.box.x < leftmost.box.x) {
            leftmost = hit;
          }
          if (hit.box.x + hit.box.w > rightmost.box.x + rightmost.box.w) {
            rightmost = hit;
          }
        }
        // Select leftmost first, then extend range to rightmost
        await score.selectElementAtPointWithMode(
          leftmost.pageIndex,
          leftmost.selectionX,
          leftmost.selectionY,
          firstMode,
        );
        await score.selectElementAtPointWithMode(
          rightmost.pageIndex,
          rightmost.selectionX,
          rightmost.selectionY,
          3,
        );
      } else {
        // For non-note elements (slurs, dynamics, etc.), use ADD mode (original behavior)
        await score.selectElementAtPointWithMode(
          first.pageIndex,
          first.selectionX,
          first.selectionY,
          firstMode,
        );
        for (let i = 1; i < hits.length; i++) {
          const hit = hits[i];
          await score.selectElementAtPointWithMode(
            hit.pageIndex,
            hit.selectionX,
            hit.selectionY,
            1,
          );
        }
      }
      return fallback;
    }

    if (!score.selectElementAtPoint) {
      console.warn('selectElementAtPoint is not available; cannot update selection in WASM');
      return fallback;
    }

    if (!additive && score.clearSelection) {
      await Promise.resolve(score.clearSelection()).catch((err: unknown) => {
        console.warn('clearSelection not available or failed:', err);
      });
    }

    await score.selectElementAtPoint(first.pageIndex, first.selectionX, first.selectionY);
    return fallback;
  };

  const noteDragSupported = Boolean(
    score?.beginElementDrag && score?.updateElementDrag && score?.endElementDrag,
  );

  const findNoteDragCandidate = (target: Element | null) => {
    if (!containerRef.current || !target || typeof target.closest !== 'function') {
      return null;
    }
    const noteEl = target.closest('.Note');
    if (!noteEl || !containerRef.current.contains(noteEl)) {
      return null;
    }
    const containerRect = containerRef.current.getBoundingClientRect();
    const rect = noteEl.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) {
      return null;
    }
    return {
      page: resolvePageIndex(noteEl),
      noteBox: {
        x: (rect.left - containerRect.left) / zoom,
        y: (rect.top - containerRect.top) / zoom,
        w: rect.width / zoom,
        h: rect.height / zoom,
      },
    };
  };

  // Half a staff space (one diatonic step) in score units, from the engine's own
  // spatium — the same value Note::verticalDrag divides by, so ghost and commit
  // agree exactly. Falls back to half the notehead height (a notehead is ~1 space
  // tall) if the export is unavailable or hasn't resolved yet.
  const resolveNoteDragHalfStep = (noteBox: {
    x: number;
    y: number;
    w: number;
    h: number;
  }): number => {
    const spatium = scoreSpatiumRef.current;
    if (spatium !== null && spatium > 0) {
      return spatium / 2;
    }
    return noteBox.h / 2;
  };

  const ensureLiveNoteDragStarted = (drag: {
    page: number;
    startX: number;
    startY: number;
    halfStep: number;
  }): Promise<boolean> => {
    if (noteDragEngineBeginRef.current) {
      return noteDragEngineBeginRef.current;
    }
    const begin = score?.beginElementDrag?.bind(score);
    if (!begin) {
      return Promise.resolve(false);
    }
    noteDragEngineBeginRef.current = Promise.resolve(begin(drag.page, drag.startX, drag.startY))
      .then((began) => {
        if (!began) {
          console.warn('Note drag: engine found no draggable element at the start point.');
        }
        return began;
      })
      .catch((err) => {
        console.warn('Starting live note drag failed:', err);
        return false;
      });
    return noteDragEngineBeginRef.current;
  };

  const scheduleLiveNoteDragUpdate = (
    drag: { page: number; startX: number; startY: number; halfStep: number },
    steps: number,
    modifiers: number,
  ) => {
    noteDragLiveUpdateRef.current = { drag, steps, modifiers };
    if (noteDragLiveFrameRef.current !== null || noteDragLiveInFlightRef.current) {
      return;
    }

    noteDragLiveFrameRef.current = requestAnimationFrame(() => {
      noteDragLiveFrameRef.current = null;
      const pending = noteDragLiveUpdateRef.current;
      noteDragLiveUpdateRef.current = null;
      if (!pending || !score?.updateElementDrag) {
        return;
      }

      const perf = startPerf('drag step');
      const task = (async () => {
        const began = await perf.time('dragBegin', () => ensureLiveNoteDragStarted(pending.drag));
        if (!began || noteDragFinishingRef.current) {
          return;
        }
        const targetY = pending.drag.startY + pending.steps * pending.drag.halfStep;
        // Y-only mode keeps the gesture in Note::verticalDrag pitch semantics.
        await perf.time('drag', () =>
          score.updateElementDrag!(
            pending.drag.page,
            pending.drag.startX,
            targetY,
            pending.modifiers,
            2,
          ),
        );
        noteDragRenderedStepsRef.current = pending.steps;
        // Render only the active page. Pointer tracking stays on window while
        // the SVG DOM is replaced, so the gesture remains uninterrupted.
        await renderScore(score, pending.drag.page, true, perf);
      })()
        .catch((err) => {
          console.warn('Live note drag update failed:', err);
        })
        .finally(() => {
          perf.end();
          noteDragLiveInFlightRef.current = null;
          const latest = noteDragLiveUpdateRef.current;
          if (latest && !noteDragFinishingRef.current) {
            scheduleLiveNoteDragUpdate(latest.drag, latest.steps, latest.modifiers);
          }
        });
      noteDragLiveInFlightRef.current = task;
    });
  };

  const stopLiveNoteDragUpdates = async () => {
    if (noteDragLiveFrameRef.current !== null) {
      cancelAnimationFrame(noteDragLiveFrameRef.current);
      noteDragLiveFrameRef.current = null;
    }
    noteDragLiveUpdateRef.current = null;
    await noteDragLiveInFlightRef.current;
  };

  const finishNoteDrag = async (
    drag: { page: number; startX: number; startY: number; halfStep: number },
    steps: number,
    modifiers: number,
    commit: boolean,
  ) => {
    if (!score?.updateElementDrag || !score?.endElementDrag) {
      return;
    }
    noteDragFinishingRef.current = true;
    const targetY = drag.startY + steps * drag.halfStep;

    try {
      await stopLiveNoteDragUpdates();
      const began = await ensureLiveNoteDragStarted(drag);
      if (!began) {
        noteDragEngineBeginRef.current = null;
        noteDragRenderedStepsRef.current = null;
        return;
      }

      if (commit && noteDragRenderedStepsRef.current !== steps) {
        await score.updateElementDrag(drag.page, drag.startX, targetY, modifiers, 2);
      }
      const committed = (await score.endElementDrag(commit)) !== false && commit;
      noteDragEngineBeginRef.current = null;
      noteDragRenderedStepsRef.current = null;

      if (score.relayout) {
        await Promise.resolve(score.relayout()).catch((err: unknown) => {
          console.warn('Relayout after note drag failed:', err);
        });
      }
      const refreshedPage = await refreshPageCount(score, currentPageRef.current);
      await renderScore(score, refreshedPage);

      if (!committed) {
        return;
      }
      setScoreDirtySinceCheckpoint(true);
      setScoreDirtySinceXml(true);
      const generation = ++selectionOverlayGenerationRef.current;
      scheduleSelectionOverlayRefresh(
        null,
        { page: drag.page, x: drag.startX, y: targetY },
        generation,
      );
      void playSelectionPreview('mutation:drag note pitch', undefined, { reselect: false });
    } catch (err) {
      console.error('Note drag failed:', err);
      await Promise.resolve(score.endElementDrag(false)).catch(() => {});
      noteDragEngineBeginRef.current = null;
      noteDragRenderedStepsRef.current = null;
      await renderScore(score, drag.page).catch(() => false);
    } finally {
      noteDragFinishingRef.current = false;
    }
  };

  const resetScorePointerGesture = () => {
    dragKindRef.current = null;
    sawPointerMoveRef.current = false;
    dragPointerIdRef.current = null;
    dragStartClientRef.current = null;
    dragStartScoreRef.current = null;
    dragAdditiveRef.current = false;
    dragActiveRef.current = false;
    noteDragRef.current = null;
    noteDragCandidateRef.current = null;
  };

  // A note drag is driven by window-level listeners rather than the wrapper's React
  // handlers: notes can sit at the very edge of the score wrapper, and the pointer
  // leaves it (into toolbars) before the drag threshold is even reached.
  const beginNoteDragWindowListeners = (pointerId: number) => {
    noteDragCleanupRef.current?.();

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) {
        return;
      }
      const startClient = dragStartClientRef.current;
      const startScore = dragStartScoreRef.current;
      const candidate = noteDragCandidateRef.current;
      if (!startClient || !startScore || !candidate) {
        return;
      }
      if (!dragActiveRef.current) {
        if (Math.hypot(ev.clientX - startClient.x, ev.clientY - startClient.y) < 4) {
          return;
        }
        dragActiveRef.current = true;
        noteDragRef.current = {
          page: candidate.page,
          startX: startScore.x,
          startY: startScore.y,
          noteBox: candidate.noteBox,
          halfStep: resolveNoteDragHalfStep(candidate.noteBox),
        };
        void ensureLiveNoteDragStarted(noteDragRef.current);
      }
      const noteDrag = noteDragRef.current;
      const current = clientToScorePoint(ev.clientX, ev.clientY);
      if (!noteDrag || !current) {
        return;
      }
      const steps = Math.round((current.y - noteDrag.startY) / noteDrag.halfStep);
      const modifiers = (ev.shiftKey ? 1 : 0) | (ev.ctrlKey ? 2 : 0) | (ev.altKey ? 4 : 0);
      setNoteDragGhost({
        x: noteDrag.noteBox.x,
        y: noteDrag.noteBox.y + steps * noteDrag.halfStep,
        w: noteDrag.noteBox.w,
        h: noteDrag.noteBox.h,
        steps,
      });
      scheduleLiveNoteDragUpdate(noteDrag, steps, modifiers);
      ev.preventDefault();
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) {
        return;
      }
      noteDragCleanupRef.current?.();
      noteDragCleanupRef.current = null;

      const noteDrag = noteDragRef.current;
      const wasActive = dragActiveRef.current;
      resetScorePointerGesture();
      setNoteDragGhost(null);

      if (!wasActive || !noteDrag) {
        // Never crossed the drag threshold: let the normal click flow handle it.
        return;
      }

      ignoreNextClickRef.current = true;
      const endScore = clientToScorePoint(ev.clientX, ev.clientY);
      if (!endScore) {
        return;
      }
      const steps = Math.round((endScore.y - noteDrag.startY) / noteDrag.halfStep);
      const modifiers = (ev.shiftKey ? 1 : 0) | (ev.ctrlKey ? 2 : 0) | (ev.altKey ? 4 : 0);
      void finishNoteDrag(noteDrag, steps, modifiers, steps !== 0);
    };

    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) {
        return;
      }
      noteDragCleanupRef.current?.();
      noteDragCleanupRef.current = null;
      const noteDrag = noteDragRef.current;
      const wasActive = dragActiveRef.current;
      resetScorePointerGesture();
      setNoteDragGhost(null);
      if (wasActive && noteDrag) {
        void finishNoteDrag(noteDrag, 0, 0, false);
      }
    };

    // Escape aborts the gesture without committing (roadmap §2.1). No engine call is
    // needed: the WASM drag only begins on release.
    const popEscape = pushEscapeLayer(ESCAPE_PRIORITY.gesture, () => {
      noteDragCleanupRef.current?.();
      noteDragCleanupRef.current = null;
      const noteDrag = noteDragRef.current;
      const wasActive = dragActiveRef.current;
      resetScorePointerGesture();
      setNoteDragGhost(null);
      if (wasActive) {
        // Swallow the click fired when the still-held pointer is released.
        ignoreNextClickRef.current = true;
      }
      if (wasActive && noteDrag) {
        void finishNoteDrag(noteDrag, 0, 0, false);
      }
    });

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    noteDragCleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      popEscape();
    };
  };

  const handleScorePointerDown = (e: React.PointerEvent) => {
    if (!interactionReady) {
      return;
    }
    if (e.button !== 0) {
      return;
    }
    if (dragKindRef.current && dragKindRef.current !== 'pointer') {
      return;
    }
    if (dragPointerIdRef.current !== null) {
      return;
    }
    if (!containerRef.current || !score) {
      return;
    }

    const start = clientToScorePoint(e.clientX, e.clientY);
    if (!start) {
      return;
    }

    const pointerTarget = e.target as Element | null;
    const spannerTarget = pointerTarget?.closest(
      '.SlurSegment, .HairpinSegment, .OttavaSegment, .PedalSegment, .VoltaSegment, .TrillSegment, .TextLineSegment',
    );
    const previousSpannerPointer = lastSpannerPointerRef.current;
    if (
      previousSpannerPointer &&
      e.timeStamp - previousSpannerPointer.time <= 500 &&
      Math.hypot(
        e.clientX - previousSpannerPointer.clientX,
        e.clientY - previousSpannerPointer.clientY,
      ) <= 8
    ) {
      lastSpannerPointerRef.current = null;
      e.preventDefault();
      e.stopPropagation();
      const engravingPoint = clientToEngravingPoint(e.clientX, e.clientY, pointerTarget);
      if (engravingPoint) {
        void beginGripEditAtPoint(
          resolvePageIndex(pointerTarget),
          engravingPoint.x,
          engravingPoint.y,
        );
      }
      return;
    }
    if (spannerTarget) {
      lastSpannerPointerRef.current = {
        time: e.timeStamp,
        clientX: e.clientX,
        clientY: e.clientY,
      };
    } else {
      lastSpannerPointerRef.current = null;
    }

    dragPointerIdRef.current = e.pointerId;
    dragKindRef.current = 'pointer';
    sawPointerMoveRef.current = false;
    dragStartClientRef.current = { x: e.clientX, y: e.clientY };
    dragStartScoreRef.current = start;
    dragAdditiveRef.current = e.metaKey || e.ctrlKey;
    dragActiveRef.current = false;
    noteDragRef.current = null;
    // Pointer-down on a note starts a repitch drag instead of a lasso selection
    // (additive modifier keeps the lasso; note-input mode places notes on click).
    noteDragCandidateRef.current =
      noteDragSupported &&
      interactiveMutationEnabled &&
      !noteDragFinishingRef.current &&
      !dragAdditiveRef.current &&
      !noteInputActiveRef.current
        ? findNoteDragCandidate(e.target as Element | null)
        : null;
    if (noteDragCandidateRef.current) {
      // Async; typically resolved well before the drag threshold is crossed.
      void gestureLateInputs.current.refreshScoreSpatium();
      beginNoteDragWindowListeners(e.pointerId);
    }
  };

  const handleScorePointerMove = (e: React.PointerEvent) => {
    if (noteInputActiveRef.current) {
      gestureLateInputs.current.updateNoteInputShadow(
        e.clientX,
        e.clientY,
        e.target as Element | null,
      );
      return;
    }
    if (dragKindRef.current !== 'pointer') {
      return;
    }
    sawPointerMoveRef.current = true;
    if (noteDragCandidateRef.current) {
      // A note drag owns this gesture via window-level listeners.
      return;
    }
    if (dragPointerIdRef.current !== e.pointerId) {
      return;
    }

    const startClient = dragStartClientRef.current;
    const startScore = dragStartScoreRef.current;
    if (!startClient || !startScore) {
      return;
    }

    const dxClient = e.clientX - startClient.x;
    const dyClient = e.clientY - startClient.y;
    const DRAG_THRESHOLD_PX = 4;

    if (!dragActiveRef.current) {
      if (Math.hypot(dxClient, dyClient) < DRAG_THRESHOLD_PX) {
        return;
      }
      dragActiveRef.current = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture is not available.
      }
    }

    const currentScore = clientToScorePoint(e.clientX, e.clientY);
    if (!currentScore) {
      return;
    }

    const x1 = Math.min(startScore.x, currentScore.x);
    const y1 = Math.min(startScore.y, currentScore.y);
    const x2 = Math.max(startScore.x, currentScore.x);
    const y2 = Math.max(startScore.y, currentScore.y);

    setDragSelectionRect({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    e.preventDefault();
  };

  const handleScorePointerUp = async (e: React.PointerEvent) => {
    if (dragKindRef.current !== 'pointer') {
      return;
    }
    if (noteDragCandidateRef.current) {
      // A note drag owns this gesture via window-level listeners.
      return;
    }
    if (dragPointerIdRef.current !== e.pointerId) {
      return;
    }

    const active = dragActiveRef.current;
    const additive = dragAdditiveRef.current;
    const startScore = dragStartScoreRef.current;

    resetScorePointerGesture();

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture is not available.
    }

    if (!active || !startScore) {
      return;
    }

    ignoreNextClickRef.current = true;

    const endScore = clientToScorePoint(e.clientX, e.clientY);
    if (!endScore) {
      setDragSelectionRect(null);
      return;
    }

    const x1 = Math.min(startScore.x, endScore.x);
    const y1 = Math.min(startScore.y, endScore.y);
    const x2 = Math.max(startScore.x, endScore.x);
    const y2 = Math.max(startScore.y, endScore.y);
    const rect = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };

    setDragSelectionRect(rect);
    const fallback = await performDragSelection(rect, additive);
    setDragSelectionRect(null);
    await refreshSelectionFromSvg(fallback);
  };

  const handleScorePointerCancel = (e: React.PointerEvent) => {
    if (dragKindRef.current !== 'pointer') {
      return;
    }
    if (noteDragCandidateRef.current) {
      // A note drag owns this gesture via window-level listeners.
      return;
    }
    if (dragPointerIdRef.current !== e.pointerId) {
      return;
    }
    resetScorePointerGesture();
    setDragSelectionRect(null);

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture is not available.
    }
  };

  const handleScoreMouseDown = (e: React.MouseEvent) => {
    if (!interactionReady) {
      return;
    }
    if (e.button !== 0) {
      return;
    }
    if (dragKindRef.current === 'pointer') {
      return;
    }
    if (dragPointerIdRef.current !== null) {
      return;
    }
    if (!containerRef.current || !score) {
      return;
    }

    const start = clientToScorePoint(e.clientX, e.clientY);
    if (!start) {
      return;
    }

    dragKindRef.current = 'mouse';
    dragPointerIdRef.current = -1;
    sawPointerMoveRef.current = false;
    dragStartClientRef.current = { x: e.clientX, y: e.clientY };
    dragStartScoreRef.current = start;
    dragAdditiveRef.current = e.metaKey || e.ctrlKey;
    dragActiveRef.current = false;
  };

  const handleScoreMouseMove = (e: React.MouseEvent) => {
    if (noteInputActiveRef.current) {
      gestureLateInputs.current.updateNoteInputShadow(
        e.clientX,
        e.clientY,
        e.target as Element | null,
      );
      return;
    }
    if (
      dragKindRef.current === 'pointer' &&
      !sawPointerMoveRef.current &&
      dragPointerIdRef.current !== null &&
      !noteDragCandidateRef.current
    ) {
      const startClient = dragStartClientRef.current;
      const startScore = dragStartScoreRef.current;
      if (!startClient || !startScore) {
        return;
      }

      const dxClient = e.clientX - startClient.x;
      const dyClient = e.clientY - startClient.y;
      const DRAG_THRESHOLD_PX = 4;

      if (!dragActiveRef.current) {
        if (Math.hypot(dxClient, dyClient) < DRAG_THRESHOLD_PX) {
          return;
        }
        dragActiveRef.current = true;
        try {
          e.currentTarget.setPointerCapture(dragPointerIdRef.current);
        } catch {
          // Ignore if pointer capture is not available.
        }
      }

      const currentScore = clientToScorePoint(e.clientX, e.clientY);
      if (!currentScore) {
        return;
      }

      const x1 = Math.min(startScore.x, currentScore.x);
      const y1 = Math.min(startScore.y, currentScore.y);
      const x2 = Math.max(startScore.x, currentScore.x);
      const y2 = Math.max(startScore.y, currentScore.y);

      setDragSelectionRect({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
      e.preventDefault();
      return;
    }
    if (dragKindRef.current !== 'mouse') {
      return;
    }
    if (dragPointerIdRef.current !== -1) {
      return;
    }

    const startClient = dragStartClientRef.current;
    const startScore = dragStartScoreRef.current;
    if (!startClient || !startScore) {
      return;
    }

    const dxClient = e.clientX - startClient.x;
    const dyClient = e.clientY - startClient.y;
    const DRAG_THRESHOLD_PX = 4;

    if (!dragActiveRef.current) {
      if (Math.hypot(dxClient, dyClient) < DRAG_THRESHOLD_PX) {
        return;
      }
      dragActiveRef.current = true;
    }

    const currentScore = clientToScorePoint(e.clientX, e.clientY);
    if (!currentScore) {
      return;
    }

    const x1 = Math.min(startScore.x, currentScore.x);
    const y1 = Math.min(startScore.y, currentScore.y);
    const x2 = Math.max(startScore.x, currentScore.x);
    const y2 = Math.max(startScore.y, currentScore.y);

    setDragSelectionRect({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    e.preventDefault();
  };

  const handleScoreMouseUp = async (e: React.MouseEvent) => {
    if (dragKindRef.current !== 'mouse') {
      return;
    }
    if (dragPointerIdRef.current !== -1) {
      return;
    }

    const active = dragActiveRef.current;
    const additive = dragAdditiveRef.current;
    const startScore = dragStartScoreRef.current;

    dragKindRef.current = null;
    dragPointerIdRef.current = null;
    dragStartClientRef.current = null;
    dragStartScoreRef.current = null;
    dragAdditiveRef.current = false;
    dragActiveRef.current = false;

    if (!active || !startScore) {
      return;
    }

    ignoreNextClickRef.current = true;

    const endScore = clientToScorePoint(e.clientX, e.clientY);
    if (!endScore) {
      setDragSelectionRect(null);
      return;
    }

    const x1 = Math.min(startScore.x, endScore.x);
    const y1 = Math.min(startScore.y, endScore.y);
    const x2 = Math.max(startScore.x, endScore.x);
    const y2 = Math.max(startScore.y, endScore.y);
    const rect = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };

    setDragSelectionRect(rect);
    const fallback = await performDragSelection(rect, additive);
    setDragSelectionRect(null);
    await refreshSelectionFromSvg(fallback);
  };

  const handleScoreClick = (e: React.MouseEvent) => {
    if (!interactionReady) {
      return;
    }
    if (gripEdit) {
      closeGripEdit(false);
    }
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      return;
    }
    if (!containerRef.current || !score) return;

    // Invalidate any overlay refresh scheduled by a previous click (double-RAF
    // in refreshSelectionFromSvg/scheduleSelectionOverlayRefresh) before it fires.
    // Without this, a stale refreshSelectionOverlay callback from an earlier
    // element click can land after this click's selection is already applied,
    // scrape a DOM that has no .selected markers for a backend-highlighted
    // range (see renderScore's highlightSelection path), find nothing, and wipe
    // selectionBoxes/selectedElement -- see docs/private/SELECTION_WORK_HANDOFF.md §3.
    selectionOverlayGenerationRef.current += 1;

    if (noteInputActiveRef.current && interactiveMutationEnabled) {
      const scorePoint = clientToScorePoint(e.clientX, e.clientY);
      if (scorePoint) {
        const pageIndex = resolvePageIndex(e.target as Element | null);
        void handlePutNoteAtPoint(pageIndex, scorePoint.x, scorePoint.y);
      }
      return;
    }

    const clearSelectionState = gestureLateInputs.current.clearEditorSelection;

    const additiveSelection = e.metaKey || e.ctrlKey || e.shiftKey;
    const isShiftClick = e.shiftKey && !e.metaKey && !e.ctrlKey;
    // DOM-based hit testing
    const target = e.target as Element;

    // Check if we clicked on a Note or Rest (or other interesting elements)
    // webmscore SVG classes: Note, Rest, Chord, etc.
    // Often the target is a <path> or <g> with the class.

    // Traverse up to find a relevant class if needed
    // Note: containerRef.current is a div that contains the SVG, so we need to traverse
    // up through the SVG structure to find Note/Rest/Chord/LayoutBreak elements
    let element: Element | null = target;
    let found = false;

    while (element) {
      const classAttr = element.getAttribute('class');
      if (hasSelectableClass(classAttr)) {
        found = true;
        break;
      }
      if (isSvgTextElement(element)) {
        found = true;
        element = resolveTextElement(element);
        break;
      }
      // Stop if we've reached containerRef or gone past it
      if (element === containerRef.current || element.parentElement === null) {
        break;
      }
      element = element.parentElement;
    }

    if (!found || !element) {
      if (score?.selectMeasureAtPoint || score?.selectElementAtPoint) {
        const scorePoint = clientToScorePoint(e.clientX, e.clientY);
        if (!scorePoint) {
          clearSelectionState();
          return;
        }
        const pageIndex = resolvePageIndex(target);
        const fallback: SelectionFallback = {
          index: null,
          point: { page: pageIndex, x: scorePoint.x, y: scorePoint.y },
        };

        // Try selectElementAtPoint first, then fall back to selectMeasureAtPoint
        // Desktop MuseScore's Ctrl+Click on empty bar space does not build a list
        // selection (Score::selectAdd, score.cpp:2984): it either replaces the
        // range with the newly clicked bar, or -- when re-clicking the bar that
        // is already the sole selection -- toggles it off
        // (NotationInteraction::doSelect deselects on a Ctrl-click of an
        // already-selected item). Bars never join a List upstream, and measure
        // deletion (cmdTimeDelete) requires SelState::RANGE and refuses a List
        // outright, so there is no "add this bar too, keep the others" to build.
        // The only behaviour that isn't already the default replace-click is the
        // toggle-off, handled below.
        const isCtrlClick = (e.ctrlKey || e.metaKey) && !e.shiftKey;

        const trySelect = async (): Promise<boolean | 'cleared'> => {
          // Desktop MuseScore maps Shift+Click to SelectType::RANGE and plain
          // click to SINGLE (notationviewinputcontroller.cpp). Mode 3 is RANGE,
          // so shift-clicking another bar -- including one on a different staff
          // -- widens the existing selection instead of replacing it.
          //
          // This has to go through the measure path, not the element one: empty
          // space inside a bar matches no selectable item, so selectElementAtPoint
          // returns false and bar selection actually comes from the
          // selectMeasureAtPoint fallback below. The extend variant is that same
          // lookup without the deselectAll, so the range widens instead.
          if (isShiftClick && score.extendMeasureSelectionAtPoint) {
            const extended = await score.extendMeasureSelectionAtPoint(
              pageIndex,
              scorePoint.x,
              scorePoint.y,
            );
            if (extended) {
              return true;
            }
          }
          if (score.selectElementAtPoint) {
            const elementSelected = await score.selectElementAtPoint(
              pageIndex,
              scorePoint.x,
              scorePoint.y,
            );
            if (elementSelected) {
              return true;
            }
          }

          // If no element was selected, try selecting the measure
          if (score.selectMeasureAtPoint) {
            const readMeasureRange = async () => {
              if (!score.selectionMeasureRange) {
                return null;
              }
              try {
                return await score.selectionMeasureRange();
              } catch {
                return null;
              }
            };

            const previousRange = isCtrlClick ? await readMeasureRange() : null;

            const measureSelected = await score.selectMeasureAtPoint(
              pageIndex,
              scorePoint.x,
              scorePoint.y,
            );
            if (!measureSelected) {
              return false;
            }

            if (
              isCtrlClick &&
              score.clearSelection &&
              previousRange &&
              previousRange.startMeasureIndex === previousRange.endMeasureIndex
            ) {
              const newRange = await readMeasureRange();
              const sameSingleBar =
                newRange &&
                newRange.startMeasureIndex === previousRange.startMeasureIndex &&
                newRange.endMeasureIndex === previousRange.endMeasureIndex;
              if (sameSingleBar) {
                await score.clearSelection();
                return 'cleared' as const;
              }
            }

            return Boolean(measureSelected);
          }

          return false;
        };

        trySelect()
          .then(async (selected) => {
            if (selected === false || selected === 'cleared') {
              clearSelectionState();
              return;
            }

            // Get selection bounding boxes for keyboard/button enablement
            let hasMeasureSelection = false;
            if (score.getSelectionBoundingBoxes) {
              try {
                const bboxes = await score.getSelectionBoundingBoxes();
                if (bboxes && bboxes.length > 0) {
                  hasMeasureSelection = true;
                  // Set boxes for state tracking (keyboard shortcuts, button states)
                  // Set backend highlighting flag to skip visual rendering (backend handles it)
                  const boxes: SelectionBox[] = bboxes.map((bb, index) => {
                    const x = bb.x;
                    const y = bb.y;
                    const w = bb.width;
                    const h = bb.height;
                    const page = bb.page;
                    return {
                      index,
                      page,
                      x,
                      y,
                      w,
                      h,
                      centerX: x + w / 2,
                      centerY: y + h / 2,
                      classes: 'Measure',
                    };
                  });
                  setSelectionBoxes(boxes);
                  setHasBackendHighlighting(true);
                }
              } catch (err) {
                console.warn('[ScoreEditor] Failed to get selection bounding boxes:', err);
              }
            }

            // Render with backend highlighting
            // For measure selections, skip overlay refresh to preserve selectionBoxes state
            if (hasMeasureSelection) {
              await renderScore(score, pageIndex);
              void playSelectionPreview('selection-click:measure', fallback.point);
            } else {
              // For single element selections, use normal flow with overlay
              setHasBackendHighlighting(false);
              await refreshSelectionFromSvg();
              void playSelectionPreview('selection-click:element', fallback.point, {
                reselect: true,
              });
            }
          })
          .catch((err) => {
            console.warn('selectMeasureAtPoint/selectElementAtPoint not available or failed:', err);
            clearSelectionState();
          });
        return;
      }
      clearSelectionState();
      return;
    }

    const targetElement = element;
    const rect = targetElement.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    const x = (rect.left - containerRect.left) / zoom;
    const y = (rect.top - containerRect.top) / zoom;
    const w = rect.width / zoom;
    const h = rect.height / zoom;

    if (w > 0 && h > 0) {
      const pageIndex = resolvePageIndex(targetElement);
      // Use center of the box for selection to reduce edge misses
      const centerX = x + w / 2;
      const centerY = y + h / 2;

      // Find the index by looking for Note/Rest/Chord/LayoutBreak elements
      // If we found a specific element, use it; otherwise search from target
      const allElements = Array.from(
        containerRef.current.querySelectorAll(ELEMENT_SELECTION_SELECTOR),
      );
      let index = -1;

      if (found && element) {
        // We found a Note/Rest/Chord/LayoutBreak element, try to find its index
        index = allElements.indexOf(element);
      }

      // If still not found, try targetElement
      if (index < 0) {
        index = allElements.indexOf(targetElement);
      }

      // If still not found, try to find closest parent that's in the list
      if (index < 0 && targetElement) {
        let current: Element | null = targetElement;
        while (current && current !== containerRef.current) {
          index = allElements.indexOf(current);
          if (index >= 0) break;
          current = current.parentElement;
        }
      }

      const classAttr = normalizeElementClasses(
        targetElement,
        targetElement.getAttribute('class') ?? '',
      );
      const box: SelectionBox = {
        index: index >= 0 ? index : null,
        page: pageIndex,
        x,
        y,
        w,
        h,
        centerX,
        centerY,
        classes: classAttr,
      };
      const fallback: SelectionFallback = {
        index: box.index,
        point: { page: pageIndex, x: centerX, y: centerY },
      };

      const canModeSelect = Boolean(score?.selectElementAtPointWithMode);
      const alreadySelected =
        additiveSelection &&
        box.index !== null &&
        selectionBoxes.some((existing) => existing.index === box.index);
      // Mode: 0 = replace, 1 = add, 2 = toggle, 3 = range
      // Use range selection (mode 3) for shift-click when there's already a selection
      const hasExistingSelection = selectionBoxes.length > 0;
      const mode = canModeSelect
        ? additiveSelection
          ? alreadySelected
            ? 2 // Toggle off if already selected
            : isShiftClick && hasExistingSelection
              ? 3 // Range selection for shift-click
              : 1 // Add selection for ctrl/cmd-click
          : 0 // Replace selection
        : null;

      // DOM overlay coordinates are in the wrapper's CSS space, while
      // engine hit testing expects the SVG's engraving coordinate space.
      const engravingPoint = clientToEngravingPoint(e.clientX, e.clientY, targetElement);
      const selectionX = engravingPoint?.x ?? centerX;
      const selectionY = engravingPoint?.y ?? centerY;

      const selectionPromise = canModeSelect
        ? score.selectElementAtPointWithMode!(
            pageIndex,
            selectionX,
            selectionY,
            mode as 0 | 1 | 2 | 3,
          )
        : score.selectElementAtPoint?.(pageIndex, selectionX, selectionY);

      if (selectionPromise !== undefined) {
        const selectionRun = Promise.resolve(selectionPromise);
        selectionInFlightRef.current = selectionRun;
        void selectionRun
          .then((selected) => {
            if (selected === false) {
              throw new Error('selectElementAtPoint returned false');
            }
            return refreshSelectionFromSvg(fallback);
          })
          .then(() => {
            void playSelectionPreview(
              'selection-click:element',
              fallback.point,
              // The click RPC above already established the engine
              // selection. Replaying it races immediate copy/paste and can
              // replace the destination after the command was dispatched.
              { reselect: false },
            );
          })
          .catch((err) => {
            console.warn('selectElementAtPoint not available or failed:', err);
            setSelectedElement(null);
            setSelectionBoxes([]);
            setSelectedPoint(null);
            setSelectedIndex(null);
            setSelectedElementClasses('');
            setSelectedLayoutBreakSubtype(null);
          })
          .finally(() => {
            if (selectionInFlightRef.current === selectionRun) {
              selectionInFlightRef.current = null;
            }
          });
      }

      if (!additiveSelection) {
        setSelectionBoxes([box]);
        setSelectedElement({ x, y, w, h });
        setSelectedIndex(box.index);
        setSelectedPoint({ page: pageIndex, x: centerX, y: centerY });
        return;
      }

      if (alreadySelected && box.index !== null) {
        const next = selectionBoxes.filter((existing) => existing.index !== box.index);
        setSelectionBoxes(next);

        if (selectedIndex === box.index) {
          const nextPrimary = next.at(-1) ?? null;
          if (!nextPrimary) {
            setSelectedElement(null);
            setSelectedPoint(null);
            setSelectedIndex(null);
          } else {
            setSelectedElement({
              x: nextPrimary.x,
              y: nextPrimary.y,
              w: nextPrimary.w,
              h: nextPrimary.h,
            });
            setSelectedPoint({
              page: nextPrimary.page,
              x: nextPrimary.centerX,
              y: nextPrimary.centerY,
            });
            setSelectedIndex(nextPrimary.index);
          }
        }
        return;
      }

      // Additive selection: add clicked element as the new primary.
      setSelectionBoxes([...selectionBoxes, box]);
      setSelectedElement({ x, y, w, h });
      setSelectedIndex(box.index);
      setSelectedPoint({ page: pageIndex, x: centerX, y: centerY });
    } else {
      setSelectedElement(null);
      setSelectionBoxes([]);
      setSelectedPoint(null);
      setSelectedIndex(null);
      setSelectedElementClasses('');
      setSelectedLayoutBreakSubtype(null);
    }
  };

  // Unmounting ends a drag or grip edit that is still in flight.
  useEffect(
    () => () => {
      noteDragCleanupRef.current?.();
      noteDragCleanupRef.current = null;
      if (noteDragLiveFrameRef.current !== null) {
        cancelAnimationFrame(noteDragLiveFrameRef.current);
        noteDragLiveFrameRef.current = null;
      }
      void Promise.resolve(scoreRef.current?.endElementDrag?.(false)).catch(() => {});
    },
    [scoreRef, noteDragCleanupRef, noteDragLiveFrameRef],
  );
  useEffect(
    () => () => {
      gripDragCleanupRef.current?.();
      gripDragCleanupRef.current = null;
      void Promise.resolve(score?.endGripEdit?.(false)).catch(() => {});
    },
    [score, gripDragCleanupRef],
  );

  return {
    beginGripEditAtPoint,
    closeGripEdit,
    dragPointerIdRef,
    dragSelectionRect,
    gripEdit,
    handleGripPointerDown,
    handleScoreClick,
    handleScoreMouseDown,
    handleScoreMouseMove,
    handleScoreMouseUp,
    handleScorePointerCancel,
    handleScorePointerDown,
    handleScorePointerMove,
    handleScorePointerUp,
    noteDragGhost,
  };
}
