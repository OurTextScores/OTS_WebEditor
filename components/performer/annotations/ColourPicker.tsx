'use client';

import React from 'react';
import { COLORS } from './annotationTools';

/** Any CSS colour as the colour input needs it (#rrggbb): the canvas normalises a name ('crimson') to its hex. */
function asHex(color: string): string {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return color;
  context.fillStyle = color;
  return context.fillStyle;
}

/**
 * Any colour, after the four swatches: the system colour picker (iPadOS shows its own colour sheet). Marked as chosen
 * when the ink is not one of the swatches.
 */
export function ColourPicker({
  color,
  onColor,
}: {
  color: string;
  onColor: (color: string) => void;
}) {
  const custom = !(COLORS as readonly string[]).includes(color);
  return (
    <label
      title="Another colour"
      className="relative flex h-6 w-6 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2"
      style={{
        background: custom ? color : 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
        borderColor: custom ? 'currentColor' : 'transparent',
      }}
    >
      <input
        type="color"
        aria-label="Another colour"
        data-testid="annotate-color-custom"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        value={asHex(color)}
        onChange={(event) => onColor(event.target.value)}
      />
    </label>
  );
}
