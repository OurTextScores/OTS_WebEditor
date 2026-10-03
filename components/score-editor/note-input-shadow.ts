import type React from 'react';

export type UpdateNoteInputShadowContext = {
  noteInputActiveRef: React.RefObject<boolean>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  setNoteInputShadow: React.Dispatch<
    React.SetStateAction<{ x: number; y: number; w: number; h: number } | null>
  >;
  clientToScorePoint: (clientX: number, clientY: number) => { x: number; y: number } | null;
  resolvePageIndex: (element: Element | null) => number;
  zoom: number;
  scoreSpatiumRef: React.RefObject<number | null>;
};

export function updateNoteInputShadowImpl(
  ctx: UpdateNoteInputShadowContext,
  clientX: number,
  clientY: number,
  target: Element | null,
) {
  const {
    noteInputActiveRef,
    containerRef,
    setNoteInputShadow,
    clientToScorePoint,
    resolvePageIndex,
    zoom,
    scoreSpatiumRef,
  } = ctx;
  if (!noteInputActiveRef.current || !containerRef.current) {
    setNoteInputShadow(null);
    return;
  }
  const point = clientToScorePoint(clientX, clientY);
  if (!point) {
    setNoteInputShadow(null);
    return;
  }

  const page = resolvePageIndex(target);
  const containerRect = containerRef.current.getBoundingClientRect();
  let nearest: {
    top: number;
    left: number;
    right: number;
    distance: number;
    spatium: number;
  } | null = null;
  for (const staffLines of Array.from(containerRef.current.querySelectorAll('.StaffLines'))) {
    if (resolvePageIndex(staffLines) !== page) {
      continue;
    }
    const rect = staffLines.getBoundingClientRect();
    const left = (rect.left - containerRect.left) / zoom;
    const right = (rect.right - containerRect.left) / zoom;
    const top = (rect.top - containerRect.top) / zoom;
    const bottom = (rect.bottom - containerRect.top) / zoom;
    if (point.x < left || point.x > right) {
      continue;
    }
    const lineSetHeight = bottom - top;
    const spatium = scoreSpatiumRef.current ?? (lineSetHeight > 0 ? lineSetHeight / 4 : 0);
    if (!(spatium > 0)) {
      continue;
    }
    const distance =
      lineSetHeight > 0
        ? point.y < top
          ? top - point.y
          : point.y > bottom
            ? point.y - bottom
            : 0
        : Math.abs(point.y - top);
    if (distance > spatium * 2 || (nearest && distance >= nearest.distance)) {
      continue;
    }
    nearest = { top, left, right, distance, spatium };
  }

  if (!nearest && target?.closest('svg') && containerRef.current.contains(target)) {
    const spatium = scoreSpatiumRef.current;
    if (spatium && spatium > 0) {
      nearest = {
        top: 0,
        left: 0,
        right: containerRect.width / zoom,
        distance: 0,
        spatium,
      };
    }
  }
  if (!nearest || !(nearest.spatium > 0)) {
    setNoteInputShadow(null);
    return;
  }
  const halfStep = nearest.spatium / 2;
  const snappedY = nearest.top + Math.round((point.y - nearest.top) / halfStep) * halfStep;
  const width = nearest.spatium * 1.15;
  const height = nearest.spatium * 0.78;
  setNoteInputShadow({
    x: Math.min(Math.max(point.x - width / 2, nearest.left), nearest.right - width),
    y: snappedY - height / 2,
    w: width,
    h: height,
  });
}
