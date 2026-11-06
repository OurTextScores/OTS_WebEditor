import { useEffect, useRef, useState } from 'react';
import {
  changesTo,
  describeMark,
  EMPTY_HISTORY,
  recorded,
  type Change,
  type MarksHistory,
} from './annotationHistory';
import type { Annotation } from './annotationModel';
import { deviceAnnotationStore, type AnnotationStore } from './annotationStore';

/**
 * The annotations of one score and part (performer mode, Phase 4), from the device store: read on open, and saved on
 * the device at each change (nothing to save by hand). Changes made in this session form a history, as in the editor:
 * undo, redo, or jump to any step.
 */
export function useAnnotations(scoreKey: string, scorePart: number, store?: AnnotationStore) {
  const [storeInstance] = useState(() => store ?? deviceAnnotationStore());
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  // The history belongs to one score, part and reading of the store: after a switch (or a reload) it is empty
  const owner = `${scoreKey}\u0000${scorePart}`;
  const [kept, setKept] = useState<{ owner: string; revision: number; history: MarksHistory }>({
    owner,
    revision: 0,
    history: EMPTY_HISTORY,
  });
  // The history as of the last change, for handlers (state is a render snapshot)
  const latest = useRef(kept);
  const nextId = useRef(1);
  /** Bumped to read the store again (after an import or a checkpoint restored). */
  const [revision, setRevision] = useState(0);

  const current = (): MarksHistory =>
    latest.current.owner === owner && latest.current.revision === revision
      ? latest.current.history
      : EMPTY_HISTORY;
  const setBoth = (next: MarksHistory) => {
    latest.current = { owner, revision, history: next };
    setKept(latest.current);
  };
  const history = kept.owner === owner && kept.revision === revision ? kept.history : EMPTY_HISTORY;

  useEffect(() => {
    let live = true;
    void storeInstance
      .list(scoreKey)
      .then((list) => {
        if (live) setAnnotations(list.filter((annotation) => annotation.scorePart === scorePart));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [storeInstance, scoreKey, scorePart, revision]);

  const apply = async (changes: readonly Change[]) => {
    setAnnotations((list) => {
      let next = list;
      for (const { before, after } of changes) {
        const id = (before ?? after)!.id;
        next = next.filter((annotation) => annotation.id !== id);
        if (after) next = [...next, after];
      }
      return next;
    });
    for (const { before, after } of changes) {
      if (after) await storeInstance.put(after);
      else if (before) await storeInstance.remove(before.id);
    }
  };

  /** Makes and records a step: its changes are applied and saved. */
  const record = (description: string, changes: readonly Change[]) => {
    if (!changes.length) return Promise.resolve();
    setBoth(recorded(current(), { id: nextId.current++, description, changes }));
    return apply(changes);
  };

  const add = (annotation: Annotation) =>
    record(describeMark(annotation), [{ before: null, after: annotation }]);
  const remove = (annotation: Annotation) =>
    record(`Erase: ${describeMark(annotation)}`, [{ before: annotation, after: null }]);
  const replace = (
    before: Annotation,
    after: Annotation,
    description = `Change: ${describeMark(after)}`,
  ) => record(description, [{ before, after }]);

  /** Moves to `target` steps applied (undo below the current step, redo above it). */
  const jump = (target: number) => {
    const now = current();
    const changes = changesTo(now, target);
    setBoth({ ...now, index: Math.max(0, Math.min(now.steps.length, target)) });
    void apply(changes);
  };
  const undo = () => jump(current().index - 1);
  const redo = () => jump(current().index + 1);
  const reload = () => setRevision((value) => value + 1);

  return {
    annotations,
    add,
    remove,
    replace,
    record,
    undo,
    redo,
    jump,
    history,
    canUndo: history.index > 0,
    canRedo: history.index < history.steps.length,
    store: storeInstance,
    reload,
  };
}
