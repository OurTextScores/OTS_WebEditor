import { useCallback, useEffect, useRef, useState } from 'react';
import type { SystemLockState } from '../../../lib/webmscore-loader';
import type { EditorCore } from '../core';
import { hasSystemLockApi } from './system-lock-property';

type SystemLocksContext = Pick<
  EditorCore,
  'score' | 'scoreRef' | 'runSerializedScoreOperation' | 'ensureSelectionInWasm' | 'performMutation'
>;

export function useSystemLocks(core: SystemLocksContext, revision: unknown) {
  const { score, scoreRef, runSerializedScoreOperation, ensureSelectionInWasm, performMutation } =
    core;
  const supported = hasSystemLockApi(score);
  const [snapshot, setSnapshot] = useState<{
    score: typeof score;
    revision: unknown;
    state: SystemLockState;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!supported || !score) return;
    void runSerializedScoreOperation(async () => {
      if (scoreRef.current !== score) return;
      const state = await score.getSystemLockState?.();
      if (!cancelled && scoreRef.current === score) {
        setSnapshot(state ? { score, revision, state } : null);
      }
    }, 'read system locks').catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Could not read system locks.');
    });
    return () => {
      cancelled = true;
    };
  }, [score, scoreRef, supported, revision, refresh, runSerializedScoreOperation]);

  const mutate = useCallback(
    async (value: boolean | 'previous' | 'next') => {
      if (!supported || !score || scoreRef.current !== score || pending.current) return;
      pending.current = true;
      setBusy(true);
      setError(null);
      try {
        await performMutation(
          typeof value === 'boolean'
            ? value
              ? 'lock selected measures'
              : 'unlock selected measures'
            : `move measures to ${value} system`,
          async () => {
            if (scoreRef.current !== score) return false;
            await ensureSelectionInWasm();
            const changed =
              typeof value === 'boolean'
                ? await score.setSystemLock?.(value)
                : await score.moveSelectedMeasureToSystem?.(value);
            if (changed === false)
              setError('This system layout change is not available for the current selection.');
            return changed ?? false;
          },
          { skipWasmReselect: true },
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not change system layout.');
      } finally {
        pending.current = false;
        setBusy(false);
        setRefresh((value) => value + 1);
      }
    },
    [supported, score, scoreRef, ensureSelectionInWasm, performMutation],
  );

  const state = snapshot?.score === score && snapshot.revision === revision ? snapshot.state : null;
  return { supported, state, busy, error, mutate };
}
