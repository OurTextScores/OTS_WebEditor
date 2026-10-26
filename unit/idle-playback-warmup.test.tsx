import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  useIdlePlaybackWarmup,
  type WarmupOptions,
} from '../components/score-editor/playback-session';
import type { Score } from '../lib/webmscore-loader';
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});
it('debounces edits and rechecks eligibility inside the shared engine queue', async () => {
  let eligible = true;
  const prepare = vi.fn(async () => true);
  const queued: (() => Promise<unknown>)[] = [];
  const enqueue = vi.fn();
  const runSerialized: NonNullable<WarmupOptions['runSerialized']> = <T,>(
    operation: () => Promise<T>,
  ) => {
    enqueue();
    return new Promise<T>((resolve) => {
      queued.push(async () => {
        const value = await operation();
        resolve(value);
        return value;
      });
    });
  };
  const score = {} as Score;
  const hook = renderHook(() =>
    useIdlePlaybackWarmup({ score, canWarmup: () => eligible, runSerialized, prepare }),
  );
  act(() => {
    hook.result.current.schedule();
    hook.result.current.schedule();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(enqueue).toHaveBeenCalledOnce();
  eligible = false;
  await queued[0]();
  expect(prepare).not.toHaveBeenCalled();
  eligible = true;
  act(() => hook.result.current.schedule());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  await queued[1]();
  expect(prepare).toHaveBeenCalledOnce();
});
it('drops queued work after cancellation, score replacement or unmount', async () => {
  const prepare = vi.fn(async () => true);
  const runSerialized = <T,>(operation: () => Promise<T>) => operation();
  const hook = renderHook(
    ({ score }) => useIdlePlaybackWarmup({ score, canWarmup: () => true, runSerialized, prepare }),
    { initialProps: { score: {} as Score } },
  );
  act(() => hook.result.current.cancel());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(prepare).not.toHaveBeenCalled();
  hook.rerender({ score: {} as Score });
  const lateSchedule = hook.result.current.schedule;
  hook.unmount();
  lateSchedule(); // A mutation promise resolving after unmount cannot resurrect its warmup.
  await vi.advanceTimersByTimeAsync(1000);
  expect(prepare).not.toHaveBeenCalled();
});
