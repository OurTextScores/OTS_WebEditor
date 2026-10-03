import { useRef } from 'react';

/**
 * The state of one pointer or mouse gesture on the score canvas, shared by the router that starts it, the note drag that can take it over and the marquee that ends it. Refs only: none of it renders.
 */
export function usePointerGestureRefs() {
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

  return {
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
  };
}

export type PointerGestureRefs = ReturnType<typeof usePointerGestureRefs>;
