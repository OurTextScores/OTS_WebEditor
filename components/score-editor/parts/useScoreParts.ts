import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useRegisterCommands } from '../../../lib/commands/useRegisterCommands';
import { buildPartCommands } from './partCommands';
import {
  getDrawnPart,
  readParts,
  redraw,
  refreshAfterUndo,
  setDrawnPart,
  type PartsInputs,
} from './partActions';
import { getPartsSnapshot, setPartsSnapshot, subscribeToParts } from './partsStore';

/**
 * Parts in the editor (roadmap E18, slice 1): the live score's parts listed, one shown at a time, and parts made from
 * the instruments when the score has none. Showing a part points every engine call (drawing, selection, edits,
 * playback, export) at it; the parts are linked, so edits reach the full score and the other parts as in MuseScore.
 * Commands: `view.part.show` (argument: -1 for the full score, else the part's index), `view.part.generate`, and
 * `file.export.parts` (every part and the full score as PDFs, in one ZIP).
 */
export function useScoreParts(inputs: PartsInputs) {
  const { score } = inputs;
  const { current, score: storeScore } = useSyncExternalStore(
    subscribeToParts,
    getPartsSnapshot,
    getPartsSnapshot,
  );
  // The latest inputs, for the effects
  const latest = useRef(inputs);
  useLayoutEffect(() => {
    latest.current = inputs;
  });

  // A new score shows its full score, and lists the parts it brought (a MuseScore file's own parts).
  useEffect(() => {
    setDrawnPart(-1);
    setPartsSnapshot({ score, parts: [], current: -1 });
    if (!score) return;
    let live = true;
    void readParts(score, latest.current.runSerialized).then((parts) => {
      if (live && getPartsSnapshot().score === score) setPartsSnapshot({ parts });
    });
    return () => {
      live = false;
    };
  }, [score]);

  // An undo or redo may have added or removed parts: read them again (keeping the part shown if it is still there).
  const { undoIndex } = inputs;
  useEffect(() => {
    if (!score || undoIndex === undefined || getPartsSnapshot().score !== score) return;
    void refreshAfterUndo(latest.current);
  }, [undoIndex, score]);

  useEffect(() => {
    if (!score || storeScore !== score || getDrawnPart() === current) return;
    setDrawnPart(current);
    void redraw(latest.current, score);
  }, [current, storeScore, score]);

  // Made every render: useRegisterCommands keeps the latest behind stable registry entries.
  const commands = buildPartCommands(() => inputs);
  useRegisterCommands('global', commands);
}
