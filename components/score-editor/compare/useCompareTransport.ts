import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import type { Score, SynthAudioBatchIterator } from '@/lib/webmscore-loader';
import {
  compareStreamTarget,
  compareSideTransport,
  prepareCompareIterator,
} from './comparePlayback';
import type { TransportClockAnchor } from '@/lib/playback/transport-clock';
import { PlaybackSessionOwner } from '@/lib/playback/session-owner';
import type { CompareSide, CompareTransportState } from './compare-types';

export type { CompareSide, CompareTransportState };

/**
 * Every position a compare workspace can hold a score at.
 *
 * Two-pane workspaces simply leave `middle` null. Keyed rather than duplicated
 * per side because this hook previously carried one set of state and refs for
 * `left` and another for `right`, with a two-armed ternary to pick between
 * them — the shape `compare-types.ts` warns about, and one that silently
 * treats any third position as `right`.
 */
const COMPARE_SIDES: readonly CompareSide[] = ['left', 'middle', 'right'];

export type CompareStreamTarget = {
  sourcesRef: MutableRefObject<AudioBufferSourceNode[]>;
  iteratorRef: MutableRefObject<SynthAudioBatchIterator | null>;
  generationRef: MutableRefObject<number>;
  setIsPlaying: (value: boolean) => void;
  setIsPaused: (value: boolean) => void;
  debugLabel: string;
  onClockAnchor?: (anchor: TransportClockAnchor) => void;
  onBufferingChange?: (buffering: boolean, scoreTimeSeconds: number) => void;
  onDraining?: () => void;
};

type CompareTransportOptions = {
  scores: Record<CompareSide, Score | null>;
  audioContextRef: MutableRefObject<AudioContext | null>;
  batchSize: number;
  activateAudioContext?: () => Promise<AudioContext>;
  ensureSoundFontLoaded: (score: Score, options: { forceRetry: boolean }) => Promise<boolean>;
  stopMainAudio: () => Promise<void>;
  stopStream: (
    sourcesRef: MutableRefObject<AudioBufferSourceNode[]>,
    iteratorRef: MutableRefObject<SynthAudioBatchIterator | null>,
    options?: { awaitCancel?: boolean },
  ) => Promise<void>;
  playStream: (iterator: SynthAudioBatchIterator, target: CompareStreamTarget) => Promise<void>;
  reportUnavailable: () => void;
  reportMissingSoundFont: () => void;
  /** Told once, when the build turns out to have no ranged synth. */
  reportRangedSynthUnavailable?: (error: unknown) => void;
  reportPlaybackError: (side: CompareSide, error: unknown) => void;
  /**
   * Registers playback cancellation with the compare operation coordinator so a
   * lifecycle transition cannot destroy a score while its batch iterator is still
   * being cancelled. Only cancellation is tracked: tracking the whole play setup
   * would make every queued keyboard shortcut wait on soundfont loading.
   */
  trackOperation?: <T>(operation: Promise<T>) => Promise<T>;
};

const idleState = (): CompareTransportState => ({
  isPlaying: false,
  isPaused: false,
  isBusy: false,
});

const bySide = <T>(make: () => T): Record<CompareSide, T> => ({
  left: make(),
  middle: make(),
  right: make(),
});

export function useCompareTransport(options: CompareTransportOptions) {
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const [states, setStates] = useState<Record<CompareSide, CompareTransportState>>(() =>
    bySide(idleState),
  );
  const statesRef = useRef(states);
  const sessions = useRef(bySide(() => new PlaybackSessionOwner()));
  const activeAttempt = useRef(0);
  // A property of the engine build, not of a score or a side, so it is
  // learned once and remembered for the life of the workspace.
  const rangedSynthUnavailable = useRef(false);

  const update = useCallback((side: CompareSide, patch: Partial<CompareTransportState>) => {
    statesRef.current = {
      ...statesRef.current,
      [side]: { ...statesRef.current[side], ...patch },
    };
    setStates(statesRef.current);
  }, []);

  const track = useCallback(
    <T>(operation: Promise<T>): Promise<T> =>
      optionsRef.current.trackOperation?.(operation) ?? operation,
    [],
  );

  const stopSideAudio = useCallback(
    (side: CompareSide, stopOptions?: { awaitCancel?: boolean }) => {
      const transport = compareSideTransport(sessions.current[side], side, update);
      // Claim before the first await so a concurrent play attempt cannot publish
      // audio for a score this stop is retiring.
      const session = sessions.current[side];
      const attempt = session.begin();
      session.phaseRef.current = 'cancelling';
      transport.generationRef.current += 1;
      update(side, idleState());
      return track(
        (async () => {
          const pending = session.drain();
          await session.track(
            optionsRef.current.stopStream(transport.sourcesRef, transport.iteratorRef, stopOptions),
          );
          await pending;
          if (session.isCurrent(attempt)) {
            session.phaseRef.current = 'idle';
            update(side, idleState());
          }
        })(),
      );
    },
    [track, update],
  );

  const setPaused = useCallback(
    async (side: CompareSide, paused: boolean) => {
      const session = sessions.current[side];
      const attempt = session.attemptRef.current;
      const context = optionsRef.current.audioContextRef.current;
      if (paused && context?.state === 'running') await context.suspend();
      if (!paused && context?.state === 'suspended') await context.resume();
      if (!session.isCurrent(attempt)) return;
      session.phaseRef.current = paused ? 'paused' : 'playing';
      update(side, { isPaused: paused });
    },
    [update],
  );

  /**
   * `range` plays one measure span rather than the whole score.
   *
   * The scanner's rows are systems of a scanned page, and the reviewer is
   * asking "does this line sound right" — starting every reading from bar one
   * would answer a question nobody asked. Falls back to whole-score playback
   * when the build does not expose a ranged synth.
   */
  const playSideAudio = useCallback(
    async (side: CompareSide, range?: { startMeasureIndex: number; endMeasureIndex: number }) => {
      const transport = compareSideTransport(sessions.current[side], side, update);
      const targetScore = optionsRef.current.scores[side];
      if (!targetScore?.synthAudioBatch && !targetScore?.synthAudioBatchForMeasureRange) {
        optionsRef.current.reportUnavailable();
        return;
      }

      // Claim the attempt before soundfont and iterator setup so close, replacement,
      // or a newer play request can invalidate it before any audio starts.
      const session = sessions.current[side];
      const attempt = session.begin();
      session.phaseRef.current = 'preparing';
      const exclusiveAttempt = ++activeAttempt.current;
      const isCurrent = () =>
        session.isCurrent(attempt) && exclusiveAttempt === activeAttempt.current;
      try {
        transport.setIsBusy(true);
        // Resume from this gesture before waiting for font/worker work.
        const context = optionsRef.current.activateAudioContext
          ? await optionsRef.current.activateAudioContext()
          : optionsRef.current.audioContextRef.current;
        if (context?.state === 'suspended') await context.resume();
        if (!isCurrent()) return;
        const soundFontReady = await session.track(
          optionsRef.current.ensureSoundFontLoaded(targetScore, {
            forceRetry: true,
          }),
        );
        if (!isCurrent()) {
          return;
        }
        if (!soundFontReady) {
          optionsRef.current.reportMissingSoundFont();
          return;
        }

        await optionsRef.current.stopMainAudio();
        if (!isCurrent()) {
          return;
        }
        // One transport is active at a time. With three panes this is no
        // longer "the other side" — comparing by ear means hearing one
        // reading at a time, and two at once is noise, not a comparison.
        await Promise.all(
          COMPARE_SIDES.filter((other) => other !== side).map((other) =>
            stopSideAudio(other, { awaitCancel: true }),
          ),
        );
        if (!isCurrent()) {
          return;
        }

        await optionsRef.current.stopStream(transport.sourcesRef, transport.iteratorRef, {
          awaitCancel: true,
        });
        if (!isCurrent()) return;

        const iterator = await prepareCompareIterator({
          score: targetScore,
          range: rangedSynthUnavailable.current ? undefined : range,
          batchSize: optionsRef.current.batchSize,
          session,
          isCurrent,
          onRangeUnavailable: (error) => {
            rangedSynthUnavailable.current = true;
            optionsRef.current.reportRangedSynthUnavailable?.(error);
          },
        });
        if (!isCurrent()) return;
        if (!iterator) {
          optionsRef.current.reportUnavailable();
          return;
        }
        await optionsRef.current.playStream(
          iterator,
          compareStreamTarget(
            side,
            session,
            attempt,
            transport.setIsPlaying,
            transport.setIsPaused,
          ),
        );
      } catch (error) {
        if (isCurrent()) {
          optionsRef.current.reportPlaybackError(side, error);
          await stopSideAudio(side, { awaitCancel: true });
        }
      } finally {
        // A superseded attempt must not clear the busy flag a newer attempt owns.
        if (session.isCurrent(attempt)) {
          transport.setIsBusy(false);
        }
      }
    },
    [stopSideAudio, update],
  );

  const toggleSidePlayPause = useCallback(
    async (side: CompareSide, range?: { startMeasureIndex: number; endMeasureIndex: number }) => {
      const state = statesRef.current[side];
      if (state.isPlaying && !state.isPaused) {
        await setPaused(side, true);
        return;
      }
      if (state.isPaused) {
        await setPaused(side, false);
        return;
      }
      await playSideAudio(side, range);
    },
    [setPaused, playSideAudio],
  );

  useEffect(
    () => () => {
      for (const side of COMPARE_SIDES) void stopSideAudio(side, { awaitCancel: true });
    },
    [stopSideAudio],
  );

  // A score that has been replaced must not keep playing: the audio would no
  // longer be of anything on screen.
  const previousScoresRef = useRef<Record<CompareSide, Score | null>>(bySide(() => null));
  useEffect(() => {
    for (const side of COMPARE_SIDES) {
      const previous = previousScoresRef.current[side];
      if (previous && previous !== options.scores[side]) {
        void stopSideAudio(side);
      }
      previousScoresRef.current[side] = options.scores[side];
    }
  }, [options.scores, stopSideAudio]);

  return useMemo(
    () => ({
      left: states.left,
      middle: states.middle,
      right: states.right,
      states,
      session: (side: CompareSide) => sessions.current[side],
      stopForEdit: async () => {
        await optionsRef.current.stopMainAudio();
        await Promise.all(COMPARE_SIDES.map((side) => stopSideAudio(side, { awaitCancel: true })));
      },
      playSideAudio,
      stopSideAudio,
      toggleSidePlayPause,
    }),
    [playSideAudio, states, stopSideAudio, toggleSidePlayPause],
  );
}

export type CompareTransport = ReturnType<typeof useCompareTransport>;
