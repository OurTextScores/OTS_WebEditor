import { type SelectionFallback } from '../selection-types';
import React, { useState } from 'react';
import type { RefreshPageCount, RenderScore } from '../editor-types';
import type { MutableRefObject } from 'react';
import type { EditorCore } from '../core';
import { handleScoreClickImpl } from './score-click';
import { performDragSelection } from './marquee-selection';
import { usePointerGestureRefs } from './pointer-gesture';
import { useGripEdit } from './useGripEdit';
import { useNoteDrag } from './useNoteDrag';

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
/**
 * The canvas gestures: routes click, pointer and mouse down/move/up to the marquee, the note drag and the grip edit, which own their own state, and returns the handlers the score canvas binds.
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
    gestureLateInputs,
  } = ctx;

  const { clientToEngravingPoint, containerRef, noteInputActiveRef, resolvePageIndex, score } =
    core;

  const [dragSelectionRect, setDragSelectionRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  const gesture = usePointerGestureRefs();
  const {
    dragKindRef,
    dragPointerIdRef,
    dragStartClientRef,
    dragStartScoreRef,
    dragAdditiveRef,
    dragActiveRef,
    sawPointerMoveRef,
    lastSpannerPointerRef,
    noteDragCandidateRef,
    noteDragRef,
    resetScorePointerGesture,
  } = gesture;

  const {
    noteDragFinishingRef,
    noteDragGhost,
    noteDragSupported,
    findNoteDragCandidate,
    beginNoteDragWindowListeners,
  } = useNoteDrag({
    core,
    gesture,
    clientToScorePoint,
    ignoreNextClickRef,
    refreshPageCount,
    renderScore,
    scheduleSelectionOverlayRefresh,
    playSelectionPreview,
    scoreSpatiumRef,
  });

  const { beginGripEditAtPoint, closeGripEdit, gripEdit, handleGripPointerDown } = useGripEdit({
    core,
    refreshPageCount,
    renderScore,
    engravingToOverlayPoint,
    refreshSelectionFromSvg,
    interactiveMutationEnabled,
  });

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
    const fallback = await performDragSelection(core, rect, additive);
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
    const fallback = await performDragSelection(core, rect, additive);
    setDragSelectionRect(null);
    await refreshSelectionFromSvg(fallback);
  };

  const handleScoreClick = (e: React.MouseEvent) =>
    handleScoreClickImpl({ ...ctx, gripEdit, closeGripEdit }, e);

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
