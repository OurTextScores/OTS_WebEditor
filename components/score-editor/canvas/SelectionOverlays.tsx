import React from 'react';

type Box = { x: number; y: number; w: number; h: number; isMeasureBbox?: boolean };

type Props = {
  secondaryBoxes: Box[];
  selectionBoxes: Box[];
  primaryRect: Box | null;
  hasBackendHighlighting: boolean;
  overlaySuppressed: boolean;
};

/** The selection rectangles: one per system for a backend range, one for a single element, one per element for a multi-selection. */
export function SelectionOverlays({
  secondaryBoxes,
  selectionBoxes,
  primaryRect,
  hasBackendHighlighting,
  overlaySuppressed,
}: Props) {
  return (
    <>
      {/* Selection highlighting is now done natively in the SVG via highlightSelection=true in saveSvg(). Keep the overlays around for testing/interaction feedback. */}
      {secondaryBoxes.map((box, index) => (
        <div
          key={index}
          className="absolute pointer-events-none"
          style={{
            left: box.x,
            top: box.y,
            width: box.w,
            height: box.h,
          }}
        />
      ))}

      {/* Backend range selections (measure/bar clicks, Shift-extend) get one box
                        per system from the engine -- render every one of them, not just the
                        first, or a range spanning a system break loses its rectangle entirely
                        past the first line. All share the same testid: they're one logical
                        selection, not a list. */}
      {hasBackendHighlighting &&
        selectionBoxes.length > 0 &&
        !overlaySuppressed &&
        selectionBoxes.map((box, index) => (
          <div
            key={index}
            data-testid="selection-overlay"
            className="absolute pointer-events-none border-2 border-accent"
            style={{
              left: box.x,
              top: box.y,
              width: box.w,
              height: box.h,
            }}
          />
        ))}
      {primaryRect &&
        !overlaySuppressed &&
        selectionBoxes.length <= 1 &&
        !hasBackendHighlighting && (
          <div
            data-testid="selection-overlay"
            className="absolute pointer-events-none border-2 border-accent"
            style={{
              left: primaryRect.x,
              top: primaryRect.y,
              width: primaryRect.w,
              height: primaryRect.h,
            }}
          />
        )}
      {selectionBoxes.length > 1 &&
        !overlaySuppressed &&
        !hasBackendHighlighting &&
        selectionBoxes.map((box, index) => (
          <div
            key={index}
            data-testid={`selection-overlay-${index}`}
            className={`absolute pointer-events-none ${
              box.isMeasureBbox ? 'border border-accent/60' : 'bg-accent/25 border border-accent/60'
            }`}
            style={{
              left: box.x,
              top: box.y,
              width: box.w,
              height: box.h,
            }}
          />
        ))}
    </>
  );
}
