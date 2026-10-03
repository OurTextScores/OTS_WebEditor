import React from 'react';

type Props = {
  selectionRect: { x: number; y: number; w: number; h: number } | null;
  noteGhost: { x: number; y: number; w: number; h: number; steps: number } | null;
};

/** What the pointer is doing right now: the marquee rectangle, or the ghost of a note being dragged to a new pitch. */
export function DragFeedbackOverlays({ selectionRect, noteGhost }: Props) {
  return (
    <>
      {selectionRect && (
        <div
          data-testid="drag-selection-rect"
          className="absolute border border-accent bg-accent/20 pointer-events-none"
          style={{
            left: selectionRect.x,
            top: selectionRect.y,
            width: selectionRect.w,
            height: selectionRect.h,
          }}
        />
      )}

      {noteGhost && (
        <div
          data-testid="note-drag-ghost"
          className="absolute pointer-events-none z-20"
          style={{
            left: noteGhost.x,
            top: noteGhost.y,
            width: noteGhost.w,
            height: noteGhost.h,
          }}
        >
          <div className="h-full w-full rounded-full border-2 border-accent bg-accent/40" />
          {noteGhost.steps !== 0 && (
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-1 rounded bg-accent px-1 text-caption leading-tight text-white whitespace-nowrap">
              {noteGhost.steps < 0 ? `▲ ${-noteGhost.steps}` : `▼ ${noteGhost.steps}`}
            </div>
          )}
        </div>
      )}
    </>
  );
}
