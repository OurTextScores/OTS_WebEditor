import { useCallback, useEffect, useRef, useState } from 'react';
import type { Annotation } from './annotationModel';
import { deviceAnnotationStore, type AnnotationStore } from './annotationStore';

type Change = { readonly before: Annotation | null; readonly after: Annotation | null };

/**
 * The annotations of one score and part (performer mode, Phase 4), from the device store: read on open, written on
 * each change. Changes made in this session can be undone and redone.
 */
export function useAnnotations(scoreKey: string, scorePart: number, store?: AnnotationStore) {
  const [storeInstance] = useState(() => store ?? deviceAnnotationStore());
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const undoStack = useRef<Change[]>([]);
  const redoStack = useRef<Change[]>([]);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });

  useEffect(() => {
    let live = true;
    void storeInstance
      .list(scoreKey)
      .then((list) => {
        if (live) setAnnotations(list.filter((annotation) => annotation.scorePart === scorePart));
      })
      .catch(() => {});
    undoStack.current = [];
    redoStack.current = [];
    return () => {
      live = false;
    };
  }, [storeInstance, scoreKey, scorePart]);

  const apply = useCallback(
    async (change: Change) => {
      const { before, after } = change;
      setAnnotations((list) => {
        const without = list.filter((annotation) => annotation.id !== (before ?? after)!.id);
        return after ? [...without, after] : without;
      });
      if (after) await storeInstance.put(after);
      else if (before) await storeInstance.remove(before.id);
    },
    [storeInstance],
  );

  const record = useCallback(
    (change: Change) => {
      undoStack.current.push(change);
      redoStack.current = [];
      setHistory({ canUndo: true, canRedo: false });
      return apply(change);
    },
    [apply],
  );

  const add = useCallback(
    (annotation: Annotation) => record({ before: null, after: annotation }),
    [record],
  );
  const remove = useCallback(
    (annotation: Annotation) => record({ before: annotation, after: null }),
    [record],
  );
  const replace = useCallback(
    (before: Annotation, after: Annotation) => record({ before, after }),
    [record],
  );

  const undo = useCallback(() => {
    const change = undoStack.current.pop();
    if (!change) return;
    redoStack.current.push(change);
    setHistory({ canUndo: undoStack.current.length > 0, canRedo: true });
    void apply({ before: change.after, after: change.before });
  }, [apply]);
  const redo = useCallback(() => {
    const change = redoStack.current.pop();
    if (!change) return;
    undoStack.current.push(change);
    setHistory({ canUndo: true, canRedo: redoStack.current.length > 0 });
    void apply(change);
  }, [apply]);

  return { annotations, add, remove, replace, undo, redo, ...history, store: storeInstance };
}
