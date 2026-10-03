import { startPerf } from '../../../lib/perf-trace';
import { ESCAPE_PRIORITY, pushEscapeLayer } from '../../shell/keyboard/escapeLayers';
import React, { useEffect, useRef, useState } from 'react';
import type { RefreshPageCount, RenderScore } from '../editor-types';
import type { EditorCore } from '../core';
import type { PointerGestureRefs } from './pointer-gesture';

export type NoteDragContext = {
  core: EditorCore;
  gesture: PointerGestureRefs;
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
};

/**
 * Ghost-drag note repitch: the drag candidate found on pointer-down, the live engine drag that follows the pointer once it crosses the threshold, and the ghost box shown while it runs. The gesture outlives the score wrapper through window-level listeners.
 */
export function useNoteDrag(ctx: NoteDragContext) {
  const {
    core,
    gesture,
    clientToScorePoint,
    ignoreNextClickRef,
    refreshPageCount,
    renderScore,
    scheduleSelectionOverlayRefresh,
    playSelectionPreview,
    scoreSpatiumRef,
  } = ctx;
  const {
    dragStartClientRef,
    dragStartScoreRef,
    dragActiveRef,
    noteDragCandidateRef,
    noteDragRef,
    resetScorePointerGesture,
  } = gesture;
  const {
    containerRef,
    currentPageRef,
    resolvePageIndex,
    score,
    scoreRef,
    selectionOverlayGenerationRef,
    setScoreDirtySinceCheckpoint,
    setScoreDirtySinceXml,
    zoom,
  } = core;

  // Ghost-drag note repitch: candidate captured on pointer-down, gesture data once the
  // drag threshold is crossed, ghost box rendered as an overlay in score units.
  const [noteDragGhost, setNoteDragGhost] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    steps: number;
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

  return {
    beginNoteDragWindowListeners,
    findNoteDragCandidate,
    noteDragFinishingRef,
    noteDragGhost,
    noteDragSupported,
  };
}
