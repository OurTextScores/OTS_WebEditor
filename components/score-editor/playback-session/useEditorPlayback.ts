import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useScoreTransport } from '../../../lib/playback/use-score-transport';
import { getClickPreferences } from '../../../lib/playback/click-preferences';
import type { Score } from '../../../lib/webmscore-loader';
import {
  SELECTION_SYNTH_BATCH_SIZE,
  SELECTION_STREAM_MIN_STARTUP_BATCHES,
  SELECTION_STREAM_STARTUP_BUFFER_SECONDS,
  SELECTION_SYNTH_START_PREROLL_SECONDS,
  SYNTH_START_PREROLL_SECONDS,
  TRANSPORT_SYNTH_BATCH_SIZE,
} from '../playback-constants';
import { useIdlePlaybackWarmup, type WarmupOptions } from './useIdlePlaybackWarmup';
import { guardPlaybackMutations } from './mutationBoundary';

type Options = {
  score: Score | null;
  canWarmup?: WarmupOptions['canWarmup'];
  runSerialized?: WarmupOptions['runSerialized'];
  ensureSoundFont: (score: Score, forceRetry: boolean) => Promise<boolean>;
  beforeStart: () => Promise<void>;
  beforeMutation?: () => Promise<void>;
  reportError: (message: string) => void;
};

/** Editor adapter: selection synthesis and shell booleans over the shared transport. */
export function useEditorPlayback(options: Options) {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  }, [options]);
  const [duration, setDuration] = useState<{ score: Score | null; ms: number }>({
    score: null,
    ms: Number.MAX_SAFE_INTEGER,
  });
  const durationMs = duration.score === options.score ? duration.ms : Number.MAX_SAFE_INTEGER;
  const transport = useScoreTransport({
    score: options.score,
    durationMs,
    startMs: 0,
    volume: 1,
    publishProgress: false,
    ensureSoundFont: options.ensureSoundFont,
    beforeStart: () => {
      warmup.cancel();
      return latest.current.beforeStart();
    },
    onMessage: (message) => {
      if (message && !message.includes('reparing') && !message.includes('Compatibility')) {
        latest.current.reportError(message);
      }
    },
  });
  const warmup = useIdlePlaybackWarmup({
    score: options.score,
    canWarmup: options.canWarmup,
    runSerialized: options.runSerialized,
    prepare: transport.warmupPlayback,
  });
  const cancelWarmup = warmup.cancel;
  const scheduleWarmup = warmup.schedule;
  // Re-read per score and once each play is live (off the startup path): an edit, which stops playback first,
  // can change the length.
  const live = transport.state === 'playing';
  useEffect(() => {
    let current = true;
    void Promise.resolve(options.score?.playbackTimeline?.())
      .then((timeline) => {
        if (current)
          setDuration({
            score: options.score,
            ms: timeline?.durationMs ?? Number.MAX_SAFE_INTEGER,
          });
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [options.score, live]);
  const { start, stopAt, invalidate, stateRef } = transport;
  const { awaitRetirement } = transport;
  const beforeMutation = useCallback(async () => {
    cancelWarmup();
    if (!['idle', 'ended', 'unavailable'].includes(stateRef.current)) await stopAt(0);
    await latest.current.beforeMutation?.();
    await awaitRetirement();
    invalidate();
  }, [awaitRetirement, cancelWarmup, invalidate, stateRef, stopAt]);
  const guardScore = useCallback(
    (score: Score) => {
      const guarded = guardPlaybackMutations(
        score,
        () => (latest.current.score === guarded ? beforeMutation() : Promise.resolve()),
        () => {
          if (latest.current.score === guarded) scheduleWarmup();
        },
      );
      return guarded;
    },
    [beforeMutation, scheduleWarmup],
  );
  const play = useCallback(
    (fromSelection: boolean) =>
      start({
        allowFallback: !fromSelection,
        createIterator: fromSelection
          ? async (score) => {
              if (!score.synthAudioBatchFromSelection)
                throw new Error('Play from selection is unavailable in this build.');
              return score.synthAudioBatchFromSelection(SELECTION_SYNTH_BATCH_SIZE);
            }
          : undefined,
        stream: fromSelection
          ? {
              prerollSeconds: SELECTION_SYNTH_START_PREROLL_SECONDS,
              startupBufferSeconds: SELECTION_STREAM_STARTUP_BUFFER_SECONDS,
              minStartupBatches: SELECTION_STREAM_MIN_STARTUP_BATCHES,
              mergeWindowSeconds: 0.5,
            }
          : { prerollSeconds: SYNTH_START_PREROLL_SECONDS },
        // The timeline is fetched by the iterator factory only when clicks are requested.
        click: fromSelection ? { enabled: false, countIn: false, timeline: null } : undefined,
      }),
    [start],
  );
  // Fetching the beat map is part of preparation, after user-gesture context activation.
  const playFull = useCallback(() => {
    const preferences = getClickPreferences();
    if (!preferences.enabled && !preferences.countIn) return play(false);
    const click = {
      ...preferences,
      timeline: null as Awaited<ReturnType<NonNullable<Score['playbackTimeline']>>>,
    };
    return start({
      // Re-read per start: an options change restarts here with the new-option beat map.
      createIterator: async (score, startSeconds, isCurrent) => {
        const timeline = await score.playbackTimeline?.();
        if (!isCurrent()) throw new Error('Playback preparation cancelled.');
        click.timeline = timeline ?? null;
        if (!score.synthAudioBatch) throw new Error('Streaming synthesis unavailable.');
        return score.synthAudioBatch(startSeconds, TRANSPORT_SYNTH_BATCH_SIZE);
      },
      restartable: true,
      click,
    });
  }, [play, start]);
  return {
    ...transport,
    guardScore,
    beforeMutation,
    play: (fromSelection: boolean) => (fromSelection ? play(true) : playFull()),
    isPlaying: transport.state === 'playing' || transport.state === 'paused',
    isPaused: transport.state === 'paused',
    busy: transport.state === 'preparing',
  };
}
