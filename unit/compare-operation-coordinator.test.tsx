import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Score } from '../lib/webmscore-loader';
import {
  useCompareOperationCoordinator,
  type SerializedScoreOperationRunner,
} from '../components/score-editor/compare/useCompareOperationCoordinator';

const deferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const makeScore = (events: string[], name: string): Score =>
  ({
    destroy: vi.fn(() => events.push(`${name}:destroy`)),
    setNoteEntryMode: vi.fn(async (enabled: boolean) => {
      events.push(`${name}:note-input:${enabled}`);
      return true;
    }),
  }) as unknown as Score;

const renderCoordinator = (auxiliaryScore: Score | null) => {
  const auxiliaryScoreRef = createRef<Score | null>();
  auxiliaryScoreRef.current = auxiliaryScore;
  const serializedOperationSpy = vi.fn();
  const runSerializedScoreOperation: SerializedScoreOperationRunner = async (operation, label) => {
    serializedOperationSpy(label);
    return operation();
  };
  const hook = renderHook(() =>
    useCompareOperationCoordinator({
      auxiliaryScoreRef,
      runSerializedScoreOperation,
    }),
  );
  return { ...hook, auxiliaryScoreRef, serializedOperationSpy };
};

describe('useCompareOperationCoordinator', () => {
  it('invalidates queued keyboard work while an earlier operation is pending', async () => {
    const pending = deferred<void>();
    const work = vi.fn(async () => true);
    const { result } = renderCoordinator(null);

    let tracked!: Promise<void>;
    let queued!: Promise<boolean | undefined>;
    act(() => {
      tracked = result.current.trackOperation(pending.promise);
      queued = result.current.queueKeyboardOperation(work);
      result.current.invalidateOperations();
    });
    pending.resolve();

    await expect(tracked).resolves.toBeUndefined();
    await expect(queued).resolves.toBeUndefined();
    expect(work).not.toHaveBeenCalled();
    expect(result.current.hasPendingOperations()).toBe(false);
  });

  it('waits for pending work, disables note input, then destroys the auxiliary score', async () => {
    const events: string[] = [];
    const auxiliaryScore = makeScore(events, 'auxiliary');
    const liveScore = makeScore(events, 'live');
    const pending = deferred<void>();
    const { result, serializedOperationSpy } = renderCoordinator(auxiliaryScore);

    let teardown!: Promise<void>;
    act(() => {
      result.current.trackOperation(pending.promise);
      teardown = result.current.queueScoreTeardown(auxiliaryScore, liveScore, 'close');
    });
    await Promise.resolve();
    expect(events).toEqual([]);

    pending.resolve();
    await act(async () => teardown);

    expect(events).toEqual([
      'live:note-input:false',
      'auxiliary:note-input:false',
      'auxiliary:destroy',
    ]);
    expect(serializedOperationSpy).toHaveBeenCalledTimes(2);
  });

  it('does not touch or destroy an auxiliary score replaced before teardown', async () => {
    const events: string[] = [];
    const retiredScore = makeScore(events, 'retired');
    const replacementScore = makeScore(events, 'replacement');
    const liveScore = makeScore(events, 'live');
    const pending = deferred<void>();
    const { result, auxiliaryScoreRef } = renderCoordinator(retiredScore);

    let teardown!: Promise<void>;
    act(() => {
      result.current.trackOperation(pending.promise);
      teardown = result.current.queueScoreTeardown(retiredScore, liveScore, 'replacement');
      auxiliaryScoreRef.current = replacementScore;
    });
    pending.resolve();
    await act(async () => teardown);

    expect(events).toEqual(['live:note-input:false']);
    expect(retiredScore.setNoteEntryMode).not.toHaveBeenCalled();
    expect(retiredScore.destroy).not.toHaveBeenCalled();
    expect(auxiliaryScoreRef.current).toBe(replacementScore);
  });
});
