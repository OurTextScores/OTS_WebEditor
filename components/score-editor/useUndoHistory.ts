import { useCallback, useEffect, useRef, useState } from 'react';
import type { Score } from '../../lib/webmscore-loader';
import { EMPTY_HISTORY, rebuild, reconcile, type HistoryState } from './undoHistory';

/** How long after a pointer or key release the stack is read (long enough to batch a burst, short enough to feel live). */
const TOUCH_DELAY_MS = 120;

/**
 * The undo history of the open score (see `undoHistory.ts`). `refresh(label)` is called after every operation that
 * can change the engine's stack; it reads the stack once and reconciles. Calls are served one at a time, in order,
 * so a quick sequence of edits cannot interleave.
 */
export function useUndoHistory(score: Score | null) {
  const [history, setHistory] = useState<HistoryState>(EMPTY_HISTORY);
  const [refreshing, setRefreshing] = useState(false);
  // A new score has a new stack: start over (set during render, which React allows for state derived from props).
  const [forScore, setForScore] = useState(score);
  if (forScore !== score) {
    setForScore(score);
    setHistory(EMPTY_HISTORY);
  }
  const stateRef = useRef<HistoryState>(EMPTY_HISTORY);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const ids = useRef(0);
  const pending = useRef(0);
  const scoreRef = useRef<Score | null>(null);

  const commit = (next: HistoryState) => {
    stateRef.current = next;
    setHistory(next);
  };

  const refresh = useCallback((label?: string) => {
    const target = scoreRef.current;
    if (!target?.getUndoInfo) return Promise.resolve();
    pending.current += 1;
    setRefreshing(true);
    const run = async () => {
      try {
        if (scoreRef.current !== target) return;
        const info = await target.getUndoInfo?.();
        if (!info || scoreRef.current !== target) return;
        const nextId = () => (ids.current += 1);
        const { state, needsRebuild } = reconcile(stateRef.current, info, label, nextId);
        if (!needsRebuild) {
          commit(state);
          return;
        }
        const entries = (await target.getUndoEntries?.(0, info.size)) ?? [];
        if (scoreRef.current === target) commit(rebuild(entries, info, nextId));
      } catch (error) {
        console.warn('Undo history refresh failed:', error);
      }
    };
    queue.current = queue.current.then(run).finally(() => {
      pending.current -= 1;
      if (pending.current === 0) setRefreshing(false);
    });
    return queue.current;
  }, []);

  // ...and read it.
  useEffect(() => {
    scoreRef.current = score;
    stateRef.current = EMPTY_HISTORY;
    // Not synchronously: `refresh` sets state.
    void Promise.resolve().then(() => refresh());
  }, [score, refresh]);

  // Not every edit goes through `performMutation` (grip and drag gestures, text edits call the engine directly), so the
  // editor also reads the stack shortly after any pointer or key release. Until it has, Undo is assumed available.
  const touchTimer = useRef<number | undefined>(undefined);
  const touch = useCallback(() => {
    if (touchTimer.current !== undefined) return;
    pending.current += 1;
    setRefreshing(true);
    touchTimer.current = window.setTimeout(() => {
      touchTimer.current = undefined;
      void refresh().finally(() => {
        pending.current -= 1;
        if (pending.current === 0) setRefreshing(false);
      });
    }, TOUCH_DELAY_MS);
  }, [refresh]);
  useEffect(
    () => () => {
      if (touchTimer.current !== undefined) window.clearTimeout(touchTimer.current);
    },
    [],
  );

  return { history, refreshing, refresh, touch };
}
