import { useMemo, useState } from 'react';
import { readDrawWithFinger, writeDrawWithFinger } from '../platform/deviceSettings';
import type { PerformerScoreState } from '../session/usePerformerScore';
import { drawnOnPage } from './annotationPlacement';
import { COLORS, STAMPS, type AnnotationTool } from './annotationTools';
import { useAnnotationInput } from './useAnnotationInput';
import { useAnnotations } from './useAnnotations';

/**
 * Annotate mode for the perform view (Phase 4): whether it is on, the chosen tool, stamp and colour, "draw with
 * finger" (per device), the score's annotations for its part (device store, undo/redo), the pointer input, and the
 * annotations to draw on the shown page (at every Play-through occurrence of their bar).
 */
export function useAnnotateMode(input: {
  readonly state: PerformerScoreState;
  readonly scoreKey: string;
  readonly playThrough: boolean;
}) {
  const { state, scoreKey, playThrough } = input;
  const [active, setActive] = useState(false);
  const [tool, setTool] = useState<AnnotationTool>('pen');
  const [stamp, setStamp] = useState<string>(STAMPS[0]);
  const [color, setColor] = useState<string>(COLORS[0]);
  const [drawWithFinger, setDrawWithFingerState] = useState(readDrawWithFinger);
  /** A text annotation being typed: where (screen point) and how to add it. */
  const [textEntry, setTextEntry] = useState<{
    clientX: number;
    clientY: number;
    place: (text: string) => void;
  } | null>(null);
  const store = useAnnotations(scoreKey, state.part);
  const playedBars = playThrough ? state.playedBars : null;

  const drawn = useMemo(
    () =>
      state.geometry ? drawnOnPage(store.annotations, state.geometry, state.page, playedBars) : [],
    [store.annotations, state.geometry, state.page, playedBars],
  );

  const pointer = useAnnotationInput({
    geometry: state.geometry,
    page: state.page,
    playedBars,
    annotations: store.annotations,
    tool,
    stamp,
    color,
    drawWithFinger,
    scoreKey,
    scorePart: state.part,
    add: store.add,
    remove: store.remove,
    askText: (at, place) => setTextEntry({ ...at, place }),
  });

  const setDrawWithFinger = (on: boolean) => {
    writeDrawWithFinger(on);
    setDrawWithFingerState(on);
  };

  return {
    active,
    setActive,
    tool,
    setTool,
    stamp,
    setStamp,
    color,
    setColor,
    drawWithFinger,
    setDrawWithFinger,
    drawn,
    pointer,
    textEntry,
    setTextEntry,
    undo: store.undo,
    redo: store.redo,
    canUndo: store.canUndo,
    canRedo: store.canRedo,
  };
}
