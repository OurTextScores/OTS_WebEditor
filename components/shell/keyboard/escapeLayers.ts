import { useEffect, useRef } from 'react';

/**
 * Escape cancels the innermost transient thing, and the order is written down here rather
 * than falling out of which listener happened to mount last
 * (docs/private/COMMAND_REGISTRY_DESIGN_2026-10-02.md §2.4).
 *
 * Highest priority first. The selection is not a layer: it is what Escape does when no layer
 * is open (`shell.escape`).
 */
export const ESCAPE_PRIORITY = {
  /** A pointer gesture in flight: a note drag or a grip drag. */
  gesture: 50,
  /** An open grip edit (the line's handles are showing). */
  gripEdit: 40,
  /** The floating palettes. */
  palettes: 30,
  /** Note-input mode. */
  noteInput: 20,
} as const;

interface Layer {
  readonly priority: number;
  readonly onEscape: () => void;
  /** Registration order, so equal priorities close newest first. */
  readonly sequence: number;
}

let layers: Layer[] = [];
let counter = 0;

/** Adds a layer; returns the function that removes it. */
export function pushEscapeLayer(priority: number, onEscape: () => void): () => void {
  const layer: Layer = { priority, onEscape, sequence: (counter += 1) };
  layers = [...layers, layer];
  return () => {
    layers = layers.filter((candidate) => candidate !== layer);
  };
}

const top = (): Layer | undefined =>
  [...layers].sort((a, b) => b.priority - a.priority || b.sequence - a.sequence)[0];

export const hasEscapeLayer = (): boolean => layers.length > 0;

/** Closes the innermost layer. Returns whether there was one. */
export function closeTopEscapeLayer(): boolean {
  const layer = top();
  if (!layer) return false;
  layer.onEscape();
  return true;
}

export function resetEscapeLayersForTests(): void {
  layers = [];
  counter = 0;
}

/** Registers a layer while `active`. The handler may change every render. */
export function useEscapeLayer(active: boolean, priority: number, onEscape: () => void): void {
  const latest = useRef(onEscape);
  useEffect(() => {
    latest.current = onEscape;
  });
  useEffect(() => {
    if (!active) return;
    return pushEscapeLayer(priority, () => latest.current());
  }, [active, priority]);
}
