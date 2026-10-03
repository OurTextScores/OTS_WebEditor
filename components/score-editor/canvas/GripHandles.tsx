import React from 'react';
import type { GripEditInfo } from '../../../lib/webmscore-loader';

type Props = {
  gripEdit: GripEditInfo | null;
  currentPage: number;
  zoom: number;
  engravingToOverlayPoint: (x: number, y: number) => { x: number; y: number };
  onGripPointerDown: (event: React.PointerEvent, gripIndex: number) => void;
};

/** The draggable handles of the spanner being edited, drawn at their engraving positions over the score. */
export function GripHandles({
  gripEdit,
  currentPage,
  zoom,
  engravingToOverlayPoint,
  onGripPointerDown,
}: Props) {
  return (
    <>
      {gripEdit?.page === currentPage &&
        gripEdit.grips.map((grip) => {
          const overlayPoint = engravingToOverlayPoint(grip.x, grip.y);
          return (
            <button
              key={grip.index}
              type="button"
              data-testid={`spanner-grip-${grip.index}`}
              aria-label={`Spanner grip ${grip.index + 1}`}
              disabled={!grip.draggable}
              className={`absolute z-30 h-4 w-4 border-2 shadow-raised ring-1 ring-white ${
                grip.draggable
                  ? 'cursor-move border-slate-950 bg-cyan-300 hover:bg-cyan-100'
                  : 'cursor-not-allowed border-slate-700 bg-slate-300 opacity-90'
              }`}
              style={{
                left: overlayPoint.x,
                top: overlayPoint.y,
                transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                transformOrigin: 'center',
              }}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => onGripPointerDown(event, grip.index)}
              title={
                grip.draggable ? 'Drag to reshape' : 'This anchor requires the desktop score view'
              }
            />
          );
        })}
    </>
  );
}
