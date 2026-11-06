'use client';

import React, { useSyncExternalStore } from 'react';
import { getDropBoxes, subscribeToDropBoxes } from './rangeDropStore';

const NONE: readonly never[] = [];

/** Where an Alt+click/drag would paste the selected range, on the shown page: the selection's outline, dashed. */
export function RangeDropPreview({ page }: { page: number }) {
  const boxes = useSyncExternalStore(subscribeToDropBoxes, getDropBoxes, () => NONE);
  return (
    <>
      {boxes
        .filter((box) => box.page === page)
        .map((box, index) => (
          <div
            key={index}
            data-testid="range-drop-preview"
            className="pointer-events-none absolute rounded border-2 border-dashed border-accent bg-accent/5"
            style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
          />
        ))}
    </>
  );
}
