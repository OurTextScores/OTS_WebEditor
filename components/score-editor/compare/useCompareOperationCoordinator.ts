import { useCallback, useRef, type MutableRefObject } from 'react';
import type { Score } from '@/lib/webmscore-loader';

export type SerializedScoreOperationRunner = <T>(
  operation: () => Promise<T>,
  label: string,
) => Promise<T>;

type CoordinatorOptions = {
  auxiliaryScoreRef: MutableRefObject<Score | null>;
  runSerializedScoreOperation: SerializedScoreOperationRunner;
};

export function useCompareOperationCoordinator({
  auxiliaryScoreRef,
  runSerializedScoreOperation,
}: CoordinatorOptions) {
  const generationRef = useRef(0);
  const pendingOperationsRef = useRef<Set<Promise<unknown>>>(new Set());
  const scoreTeardownQueueRef = useRef<Promise<void>>(Promise.resolve());
  const keyboardQueueRef = useRef<Promise<void>>(Promise.resolve());
  const keyboardQueueEpochRef = useRef(0);

  const invalidateOperations = useCallback((invalidateQueuedKeyboard = true) => {
    generationRef.current += 1;
    if (invalidateQueuedKeyboard) {
      keyboardQueueEpochRef.current += 1;
    }
    return generationRef.current;
  }, []);

  const isGenerationCurrent = useCallback(
    (generation: number) => generationRef.current === generation,
    [],
  );

  const hasPendingOperations = useCallback(() => pendingOperationsRef.current.size > 0, []);

  const trackOperation = useCallback(<T>(operation: Promise<T>): Promise<T> => {
    const trackedOperation = operation.finally(() => {
      pendingOperationsRef.current.delete(trackedOperation);
    });
    pendingOperationsRef.current.add(trackedOperation);
    return trackedOperation;
  }, []);

  const queueKeyboardOperation = useCallback(
    <T>(operation: () => Promise<T>): Promise<T | undefined> => {
      const epoch = keyboardQueueEpochRef.current;
      // Include work started outside the keyboard queue (for example, the click
      // that selected the note or toggled note input). Snapshot before tracking
      // this queued promise to avoid waiting on ourselves.
      const pendingAtEnqueue = Array.from(pendingOperationsRef.current);
      const queued = keyboardQueueRef.current
        .catch(() => {})
        .then(async () => {
          if (pendingAtEnqueue.length > 0) {
            await Promise.allSettled(pendingAtEnqueue);
          }
          if (keyboardQueueEpochRef.current !== epoch) {
            return undefined;
          }
          return operation();
        });
      const tracked = trackOperation(queued);
      keyboardQueueRef.current = tracked.then(
        () => undefined,
        () => undefined,
      );
      return tracked;
    },
    [trackOperation],
  );

  const waitForOperations = useCallback(async () => {
    // Loop so work queued from the same browser event cannot escape the first
    // snapshot while a lifecycle transition is waiting to retire a score.
    while (pendingOperationsRef.current.size > 0) {
      await Promise.allSettled(Array.from(pendingOperationsRef.current));
    }
  }, []);

  const queueScoreTeardown = useCallback(
    (auxiliaryScore: Score | null, liveScore: Score | null, label: string) => {
      const priorTeardown = scoreTeardownQueueRef.current;
      const teardown = priorTeardown
        .catch(() => {})
        .then(async () => {
          await waitForOperations();

          const scoresToDisable = Array.from(
            new Set([liveScore, auxiliaryScore].filter((entry): entry is Score => Boolean(entry))),
          );
          for (const targetScore of scoresToDisable) {
            // A preceding lifecycle transition may already have replaced the
            // captured auxiliary score. Never call into a retired instance.
            if (targetScore === auxiliaryScore && auxiliaryScoreRef.current !== auxiliaryScore) {
              continue;
            }
            if (!targetScore.setNoteEntryMode) {
              continue;
            }
            try {
              await runSerializedScoreOperation(
                () => Promise.resolve(targetScore.setNoteEntryMode!(false)),
                `compare-note-input-off:${label}`,
              );
            } catch (error) {
              console.warn(`Failed to disable compare note input during ${label}:`, error);
            }
          }

          if (auxiliaryScore && auxiliaryScoreRef.current === auxiliaryScore) {
            auxiliaryScoreRef.current = null;
            auxiliaryScore.destroy();
          }
        });
      const guardedTeardown = teardown.catch((error) => {
        console.warn(`Failed to retire compare score during ${label}:`, error);
      });
      scoreTeardownQueueRef.current = guardedTeardown;
      return guardedTeardown;
    },
    [auxiliaryScoreRef, runSerializedScoreOperation, waitForOperations],
  );

  return {
    hasPendingOperations,
    invalidateOperations,
    isGenerationCurrent,
    queueKeyboardOperation,
    queueScoreTeardown,
    trackOperation,
  };
}
