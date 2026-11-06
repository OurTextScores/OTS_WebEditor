import { useMemo, useState } from 'react';
import { readDrawWithFinger, writeDrawWithFinger } from '../platform/deviceSettings';
import type { PerformerScoreState } from '../session/usePerformerScore';
import {
  drawnOnPage,
  hiddenAtOccurrence,
  unplacedOf,
  type DrawnAnnotation,
} from './annotationPlacement';
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
  /** A mark being erased in Play-through that shows at several occurrences: all of them, or only this one? */
  const [eraseScope, setEraseScope] = useState<{ drawn: DrawnAnnotation; count: number } | null>(
    null,
  );
  const playedBars = playThrough ? state.playedBars : null;

  const drawn = useMemo(
    () =>
      state.geometry ? drawnOnPage(store.annotations, state.geometry, state.page, playedBars) : [],
    [store.annotations, state.geometry, state.page, playedBars],
  );

  const unplaced = useMemo(
    () => (state.geometry ? unplacedOf(store.annotations, state.geometry, playedBars) : []),
    [store.annotations, state.geometry, playedBars],
  );

  /** Answers the erase question: every occurrence (the mark goes), or only the tapped one (hidden there). */
  const eraseAt = (scope: 'all' | 'one') => {
    if (!eraseScope) return;
    const { annotation, occurrence } = eraseScope.drawn;
    if (scope === 'all' || occurrence === null) void store.remove(annotation);
    else void store.replace(annotation, hiddenAtOccurrence(annotation, occurrence));
    setEraseScope(null);
  };

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
    askEraseScope: (drawn, count) => setEraseScope({ drawn, count }),
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
    eraseScope,
    eraseAt,
    cancelErase: () => setEraseScope(null),
    unplaced,
    store: store.store,
    reload: store.reload,
    removeUnplaced: store.remove,
    undo: store.undo,
    redo: store.redo,
    canUndo: store.canUndo,
    canRedo: store.canRedo,
  };
}
