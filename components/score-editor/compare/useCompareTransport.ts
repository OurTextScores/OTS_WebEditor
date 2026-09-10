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
};

type CompareTransportOptions = {
  scores: Record<CompareSide, Score | null>;
  audioContextRef: MutableRefObject<AudioContext | null>;
  batchSize: number;
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
  const sourcesRefs = useRef(bySide(() => ({ current: [] as AudioBufferSourceNode[] })));
  const iteratorRefs = useRef(bySide(() => ({ current: null as SynthAudioBatchIterator | null })));
  const generationRefs = useRef(bySide(() => ({ current: 0 })));
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

  const getSideTransport = useCallback(
    (side: CompareSide) => ({
      state: () => statesRef.current[side],
      setIsPlaying: (value: boolean) => update(side, { isPlaying: value }),
      setIsPaused: (value: boolean) => update(side, { isPaused: value }),
      setIsBusy: (value: boolean) => update(side, { isBusy: value }),
      sourcesRef: sourcesRefs.current[side],
      iteratorRef: iteratorRefs.current[side],
      generationRef: generationRefs.current[side],
    }),
    [update],
  );

  const track = useCallback(
    <T>(operation: Promise<T>): Promise<T> =>
      optionsRef.current.trackOperation?.(operation) ?? operation,
    [],
  );

  const stopSideAudio = useCallback(
    (side: CompareSide, stopOptions?: { awaitCancel?: boolean }) => {
      const transport = getSideTransport(side);
      // Claim before the first await so a concurrent play attempt cannot publish
      // audio for a score this stop is retiring.
      transport.generationRef.current += 1;
      return track(
        (async () => {
          await optionsRef.current.stopStream(
            transport.sourcesRef,
            transport.iteratorRef,
            stopOptions,
          );
          update(side, idleState());
        })(),
      );
    },
    [getSideTransport, track, update],
  );

  const pauseSideAudio = useCallback(
    async (side: CompareSide) => {
      const audioContext = optionsRef.current.audioContextRef.current;
      if (audioContext?.state === 'running') {
        await audioContext.suspend();
      }
      update(side, { isPaused: true });
    },
    [update],
  );

  const resumeSideAudio = useCallback(
    async (side: CompareSide) => {
      const audioContext = optionsRef.current.audioContextRef.current;
      if (audioContext?.state === 'suspended') {
        await audioContext.resume();
      }
      update(side, { isPaused: false });
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
      const transport = getSideTransport(side);
      const targetScore = optionsRef.current.scores[side];
      if (!targetScore?.synthAudioBatch && !targetScore?.synthAudioBatchForMeasureRange) {
        optionsRef.current.reportUnavailable();
        return;
      }

      // Claim the attempt before soundfont and iterator setup so close, replacement,
      // or a newer play request can invalidate it before any audio starts.
      const generation = ++transport.generationRef.current;
      const isCurrent = () => transport.generationRef.current === generation;
      try {
        transport.setIsBusy(true);
        const soundFontReady = await optionsRef.current.ensureSoundFontLoaded(targetScore, {
          forceRetry: true,
        });
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

        /*
         * Whether a ranged synth exists cannot be answered by asking.
         *
         * The worker proxy forwards any method name, so
         * `synthAudioBatchForMeasureRange` is always present on the object
         * and the capability check above always passes. What decides it is
         * the WASM build, which either exports `synthAudioForMeasureRange`
         * or does not — and when it does not, the call reaches
         * `undefined.apply` inside the worker. This build is one of those,
         * and every row's play button reported "unable to play audio"
         * rather than playing anything.
         *
         * So it is settled by calling: try the range, and on failure fall
         * back to the whole score, which is what the doc comment above has
         * always promised. Recorded per side, so the failing call is made
         * once and not on every row.
         */
        const wantsRange = Boolean(range) && !rangedSynthUnavailable.current;
        let iterator: SynthAudioBatchIterator | null = null;
        if (wantsRange && targetScore.synthAudioBatchForMeasureRange) {
          try {
            iterator = (await targetScore.synthAudioBatchForMeasureRange(
              range!.startMeasureIndex,
              range!.endMeasureIndex,
              optionsRef.current.batchSize,
            )) as SynthAudioBatchIterator;
          } catch (error) {
            rangedSynthUnavailable.current = true;
            optionsRef.current.reportRangedSynthUnavailable?.(error);
          }
        }
        if (!iterator) {
          if (!targetScore.synthAudioBatch) {
            optionsRef.current.reportUnavailable();
            return;
          }
          iterator = (await targetScore.synthAudioBatch(
            0,
            optionsRef.current.batchSize,
          )) as SynthAudioBatchIterator;
        }
        if (!isCurrent()) {
          await track(Promise.resolve(iterator(true)).catch(() => {}));
          return;
        }
        await optionsRef.current.playStream(iterator, {
          sourcesRef: transport.sourcesRef,
          iteratorRef: transport.iteratorRef,
          generationRef: transport.generationRef,
          setIsPlaying: transport.setIsPlaying,
          setIsPaused: transport.setIsPaused,
          debugLabel: `compare-${side}`,
        });
      } catch (error) {
        if (isCurrent()) {
          optionsRef.current.reportPlaybackError(side, error);
          await stopSideAudio(side, { awaitCancel: true });
        }
      } finally {
        // A superseded attempt must not clear the busy flag a newer attempt owns.
        if (isCurrent()) {
          transport.setIsBusy(false);
        }
      }
    },
    [getSideTransport, stopSideAudio, track],
  );

  const toggleSidePlayPause = useCallback(
    async (side: CompareSide, range?: { startMeasureIndex: number; endMeasureIndex: number }) => {
      const state = statesRef.current[side];
      if (state.isPlaying && !state.isPaused) {
        await pauseSideAudio(side);
        return;
      }
      if (state.isPaused) {
        await resumeSideAudio(side);
        return;
      }
      await playSideAudio(side, range);
    },
    [pauseSideAudio, playSideAudio, resumeSideAudio],
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
      playSideAudio,
      stopSideAudio,
      toggleSidePlayPause,
    }),
    [playSideAudio, states, stopSideAudio, toggleSidePlayPause],
  );
}

export type CompareTransport = ReturnType<typeof useCompareTransport>;
