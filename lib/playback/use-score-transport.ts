'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PlaybackOptions,
  PlaybackOptionsRequest,
  PlaybackTimeline,
  Score,
  SynthAudioBatchIterator,
} from '../webmscore-loader';
import { ClickScheduler, clicksFromTimeline, planClicks } from './click-track';
import { DEFAULT_RENDER_WINDOW } from '../playback-window';
import { SoundFontManager } from './soundfont-manager';
import { cancelSynthStream, scheduleSynthBatchStream } from './stream-scheduler';
import { clampScorePosition, scoreTimeAt } from './transport-clock';
import { startPerf } from '../perf-trace';
import { PlaybackSessionOwner, type TransportPhase } from './session-owner';
import {
  applyPlaybackOptions,
  movedTarget,
  unavailableChange,
  type PlaybackOptionsChange,
} from './options-transaction';
export type { PlaybackOptionsChange } from './options-transaction';
export type { TransportPhase } from './session-owner';
import type { StreamPlaybackOptions } from './stream-scheduler';

export type ScoreTransportState =
  'idle' | 'preparing' | 'playing' | 'paused' | 'ended' | 'unavailable';

/** A resumed (options-change) start never replays the count-in; an explicit Play can. */
const withCountIn = <T extends { countIn: boolean }>(click: T, allowed: boolean): T => ({
  ...click,
  countIn: click.countIn && allowed,
});

const isAutoplayDenial = (error: unknown) =>
  error instanceof DOMException && error.name === 'NotAllowedError';

export type PlaybackRequest = {
  createIterator?: (
    score: Score,
    startSeconds: number,
    isCurrent: () => boolean,
  ) => Promise<SynthAudioBatchIterator>;
  stream?: Pick<
    StreamPlaybackOptions,
    | 'prerollSeconds'
    | 'startupBufferSeconds'
    | 'minStartupBatches'
    | 'mergeWindowSeconds'
    | 'maxDurationSeconds'
  >;
  allowFallback?: boolean;
  click?: Options['click'];
  /** `createIterator` honours its start time, so an options change can restart it at the mapped location. */
  restartable?: boolean;
};

type Options = {
  score: Score | null;
  /** Editor overlays read refs/subscriptions; their composition root does not render on every frame. */
  publishProgress?: boolean;
  ensureSoundFont?: (score: Score, forceRetry: boolean) => Promise<boolean>;
  beforeStart?: () => Promise<void>;
  durationMs: number;
  startMs: number;
  volume: number;
  onMessage?: (message: string) => void;
  soundFontManager?: SoundFontManager<Score>;
  /** A metronome on the music's own clock, and a count-in before it starts (set by the player's Click and Count-in controls). */
  click?: { enabled: boolean; countIn: boolean; timeline: PlaybackTimeline | null };
};

export function useScoreTransport(options: Options) {
  const owner = useRef(new PlaybackSessionOwner()).current;
  const [phase, setPhase] = useState<TransportPhase>('idle');
  const { phaseRef, clockRef, positionRef } = owner;
  const requestRef = useRef<PlaybackRequest>({});
  const drainingRef = useRef(false);
  const pausedPhaseRef = useRef<TransportPhase>('playing');
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const subscribers = useRef(new Set<() => void>());
  const [state, setState] = useState<ScoreTransportState>('idle');
  const stateRef = useRef<ScoreTransportState>('idle');
  const [positionMs, setPositionMs] = useState(() => {
    positionRef.current = options.startMs;
    return options.startMs;
  });
  const [renderWindowIdle, setRenderWindowIdle] = useState(true);
  const [fallbackMode, setFallbackMode] = useState(false);
  const scoreRef = useRef(options.score);
  const durationRef = useRef(options.durationMs);
  const startRef = useRef(options.startMs);
  const optionStartRef = useRef(options.startMs);
  const volumeRef = useRef(options.volume);
  const messageRef = useRef(options.onMessage);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const { sourcesRef, iteratorRef, attemptRef: playbackAttemptRef, generationRef } = owner;
  const pendingStopRef = useRef<{ attempt: number; targetMs: number } | null>(null);
  const clickRef = useRef(options.click);
  const clickSchedulerRef = useRef<ClickScheduler | null>(null);
  const soundFontManagerRef = useRef(options.soundFontManager ?? new SoundFontManager<Score>());
  const fallbackBufferRef = useRef<AudioBuffer | null>(null);
  const fallbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [playbackOptions, setPlaybackOptionsState] = useState<PlaybackOptions | null>(null);
  const optionsPendingRef = useRef<PlaybackOptionsRequest | null>(null);
  const optionsRunRef = useRef<Promise<PlaybackOptionsChange> | null>(null);
  const countInRef = useRef(true);
  // An applied options change knows the new duration before the host refetches its timeline.
  const durationOverrideRef = useRef<{ score: Score; hostMs: number; durationMs: number } | null>(
    null,
  );

  scoreRef.current = options.score;
  const override = durationOverrideRef.current;
  durationRef.current =
    override && override.score === options.score && override.hostMs === options.durationMs
      ? override.durationMs
      : options.durationMs;
  if (optionStartRef.current !== options.startMs) {
    optionStartRef.current = options.startMs;
    startRef.current = options.startMs;
  }
  volumeRef.current = options.volume;
  messageRef.current = options.onMessage;
  clickRef.current = options.click;

  const publishState = useCallback(
    (next: ScoreTransportState) => {
      stateRef.current = next;
      phaseRef.current = next;
      setPhase(next);
      setState(next);
    },
    [phaseRef],
  );

  const publishPosition = useCallback(
    (next: number) => {
      const clamped = clampScorePosition(next, durationRef.current);
      positionRef.current = clamped;
      if (optionsRef.current.publishProgress !== false) setPositionMs(clamped);
      subscribers.current.forEach((notify) => notify());
    },
    [positionRef],
  );

  useEffect(() => {
    if (gainNodeRef.current) gainNodeRef.current.gain.value = options.volume;
  }, [options.volume]);

  const stopFallbackSource = useCallback(() => {
    const source = fallbackSourceRef.current;
    fallbackSourceRef.current = null;
    if (!source) return;
    source.onended = null;
    try {
      source.stop();
    } catch {
      /* already stopped */
    }
    try {
      source.disconnect();
    } catch {
      /* already disconnected */
    }
  }, []);

  const releaseFallbackAudio = useCallback(() => {
    stopFallbackSource();
    fallbackBufferRef.current = null;
  }, [stopFallbackSource]);

  const ensureAudioContext = useCallback(async () => {
    const audioContext = audioContextRef.current ?? new AudioContext({ sampleRate: 44_100 });
    audioContextRef.current = audioContext;
    if (!gainNodeRef.current) {
      const gain = audioContext.createGain();
      gain.gain.value = volumeRef.current;
      gain.connect(audioContext.destination);
      gainNodeRef.current = gain;
    }
    if (audioContext.state === 'suspended') await audioContext.resume();
    return audioContext;
  }, []);

  const cancel = useCallback(
    async (awaitCancel = true) => {
      const attempt = ++playbackAttemptRef.current;
      clockRef.current = null;
      clickSchedulerRef.current?.stop();
      setRenderWindowIdle(false);
      stopFallbackSource();
      const pending = owner.drain();
      await owner.track(
        cancelSynthStream({ sourcesRef, iteratorRef, generationRef }, { awaitCancel }),
      );
      if (awaitCancel) await pending;
      if (attempt === playbackAttemptRef.current) setRenderWindowIdle(true);
      return attempt;
    },
    [
      owner,
      sourcesRef,
      iteratorRef,
      generationRef,
      playbackAttemptRef,
      clockRef,
      stopFallbackSource,
    ],
  );

  const stopAt = useCallback(
    async (targetMs: number, nextState: ScoreTransportState = 'idle') => {
      const attempt = ++playbackAttemptRef.current;
      pendingStopRef.current = { attempt, targetMs };
      publishPosition(targetMs);
      publishState(nextState);
      phaseRef.current = 'cancelling';
      setPhase('cancelling');
      clockRef.current = null;
      clickSchedulerRef.current?.stop();
      setRenderWindowIdle(false);
      stopFallbackSource();
      const pending = owner.drain();
      await owner.track(
        cancelSynthStream({ sourcesRef, iteratorRef, generationRef }, { awaitCancel: true }),
      );
      await pending;
      if (pendingStopRef.current?.attempt === attempt) pendingStopRef.current = null;
      if (attempt !== playbackAttemptRef.current) return false;
      setRenderWindowIdle(true);
      publishPosition(targetMs);
      publishState(nextState);
      return true;
    },
    [
      owner,
      sourcesRef,
      iteratorRef,
      generationRef,
      playbackAttemptRef,
      clockRef,
      phaseRef,
      publishPosition,
      publishState,
      stopFallbackSource,
    ],
  );

  const playFallbackFrom = useCallback(
    async (activeScore: Score, targetMs: number, attempt: number, prepare: boolean) => {
      const audioContext = await ensureAudioContext();
      if (attempt !== playbackAttemptRef.current) return;
      let buffer = fallbackBufferRef.current;
      if (!buffer || prepare) {
        if (!activeScore.saveAudio)
          throw new Error('Compatibility audio is unavailable in this build.');
        messageRef.current?.('Streaming unavailable — preparing compatibility audio…');
        fallbackBufferRef.current = null;
        const wav = await owner.track(activeScore.saveAudio('wav'));
        if (attempt !== playbackAttemptRef.current) return;
        try {
          buffer = await audioContext.decodeAudioData(wav.slice().buffer as ArrayBuffer);
        } catch {
          fallbackBufferRef.current = null;
          throw new Error('Compatibility audio could not be decoded.');
        }
        if (attempt !== playbackAttemptRef.current) return;
        fallbackBufferRef.current = buffer;
      }
      if (attempt !== playbackAttemptRef.current) return;
      stopFallbackSource();
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNodeRef.current ?? audioContext.destination);
      const targetSeconds = Math.max(0, Math.min(targetMs / 1000, buffer.duration));
      fallbackSourceRef.current = source;
      const clicks = requestRef.current.click ?? clickRef.current;
      const clickPlan = clicks
        ? planClicks(clicks.timeline, targetMs, withCountIn(clicks, countInRef.current))
        : null;
      const musicStart = audioContext.currentTime + (clickPlan?.leadInSeconds ?? 0);
      clockRef.current = { contextTime: musicStart, scoreTimeSeconds: targetSeconds };
      if (clickPlan) {
        clickSchedulerRef.current ??= new ClickScheduler(audioContext, {
          destination: gainNodeRef.current ?? undefined,
        });
        clickSchedulerRef.current.start(clockRef.current, clickPlan.clicks, clickPlan.fromMs);
      }
      source.onended = () => {
        if (attempt !== playbackAttemptRef.current) return;
        if (fallbackSourceRef.current !== source) return;
        fallbackSourceRef.current = null;
        try {
          source.disconnect();
        } catch {
          /* already disconnected */
        }
        setRenderWindowIdle(true);
        clickSchedulerRef.current?.stop();
        publishPosition(Math.min(durationRef.current, buffer.duration * 1000));
        publishState('ended');
      };
      try {
        source.start(clickPlan?.leadInSeconds ? musicStart : 0, targetSeconds);
      } catch (error) {
        if (fallbackSourceRef.current === source) fallbackSourceRef.current = null;
        try {
          source.disconnect();
        } catch {
          /* already disconnected */
        }
        clockRef.current = null;
        throw error;
      }
      setFallbackMode(true);
      setRenderWindowIdle(true);
      publishPosition(targetMs);
      messageRef.current?.('Compatibility audio');
      publishState('playing');
      if (clickPlan?.leadInSeconds) {
        phaseRef.current = 'count-in';
        setPhase('count-in');
      }
    },
    [
      owner,
      playbackAttemptRef,
      clockRef,
      phaseRef,
      ensureAudioContext,
      publishPosition,
      publishState,
      stopFallbackSource,
    ],
  );

  const ensureFont = useCallback(
    (score: Score, forceRetry: boolean) =>
      owner.track(
        optionsRef.current.ensureSoundFont?.(score, forceRetry) ??
          soundFontManagerRef.current.ensure(score, { forceRetry }),
      ),
    [owner],
  );

  const playFrom = useCallback(
    async (targetMs: number, forceRetry = false, countIn = true) => {
      const activeScore = scoreRef.current;
      if (!activeScore?.setSoundFont) {
        setRenderWindowIdle(true);
        messageRef.current?.('Playback is unavailable in this build.');
        publishState('unavailable');
        return;
      }
      const attempt = owner.begin();
      drainingRef.current = false;
      clockRef.current = null;
      clickSchedulerRef.current?.stop();
      stopFallbackSource();
      const previousCancellation = owner.track(
        cancelSynthStream({ sourcesRef, iteratorRef, generationRef }, { awaitCancel: true }),
      );
      // Creation/resume happens synchronously on the Play gesture, before font/worker awaits.
      const contextReady = ensureAudioContext();
      void contextReady.catch(() => {});
      const request = requestRef.current;
      countInRef.current = countIn;
      setRenderWindowIdle(false);
      publishState('preparing');
      messageRef.current?.('Preparing audio…');
      const preparePerf = startPerf('playback:prepare:player');
      let compatibilityAttempted = false;
      try {
        const audioContext = await contextReady;
        if (!owner.isCurrent(attempt)) return;
        await previousCancellation;
        if (!owner.isCurrent(attempt)) return;
        // Never prepare under options that are about to change; a target in the old time base moves with them.
        targetMs = movedTarget(await optionsRunRef.current?.catch(() => null), targetMs);
        if (!owner.isCurrent(attempt)) return;
        await optionsRef.current.beforeStart?.();
        if (!owner.isCurrent(attempt)) return;
        const ready = await preparePerf.time('soundfont', () =>
          ensureFont(activeScore, forceRetry),
        );
        if (!ready || attempt !== playbackAttemptRef.current) {
          if (!ready && attempt === playbackAttemptRef.current) {
            setRenderWindowIdle(true);
            messageRef.current?.('Playback soundfont is unavailable.');
            publishState('unavailable');
          }
          return;
        }
        if (fallbackBufferRef.current && !request.createIterator) {
          compatibilityAttempted = true;
          await playFallbackFrom(activeScore, targetMs, attempt, false);
          return;
        }
        if (!activeScore.synthAudioBatch && !request.createIterator) {
          compatibilityAttempted = true;
          await playFallbackFrom(activeScore, targetMs, attempt, true);
          return;
        }
        await cancelSynthStream({ sourcesRef, iteratorRef, generationRef }, { awaitCancel: true });
        if (attempt !== playbackAttemptRef.current) return;
        const iterator = await preparePerf.time('nativePrepare', () =>
          owner.prepareIterator(
            () =>
              request.createIterator
                ? request.createIterator(activeScore, targetMs / 1000, () =>
                    owner.isCurrent(attempt),
                  )
                : activeScore.synthAudioBatch!(targetMs / 1000, 2),
            () => owner.isCurrent(attempt),
          ),
        );
        preparePerf.end();
        if (attempt !== playbackAttemptRef.current) return;
        publishPosition(targetMs);
        messageRef.current?.('');
        // A metronome and count-in, when asked for: clicks come from the engine's beat times and share the music's anchor.
        const clickOptions = request.click ?? clickRef.current;
        const clickPlan = clickOptions
          ? planClicks(clickOptions.timeline, targetMs, withCountIn(clickOptions, countIn))
          : null;
        if (clickPlan) {
          clickSchedulerRef.current ??= new ClickScheduler(audioContext, {
            destination: gainNodeRef.current ?? undefined,
          });
        }
        await scheduleSynthBatchStream(iterator, audioContext, {
          leadInSeconds: clickPlan?.leadInSeconds,
          sourcesRef,
          iteratorRef,
          generationRef,
          debugLabel: 'score-transport',
          ...request.stream,
          renderWindow: DEFAULT_RENDER_WINDOW,
          destination: gainNodeRef.current ?? undefined,
          onClockAnchor: (anchor) => {
            clockRef.current = anchor;
            publishPosition(anchor.scoreTimeSeconds * 1000);
            if ((clickPlan?.leadInSeconds ?? 0) > 0 && phaseRef.current !== 'buffering') {
              phaseRef.current = 'count-in';
              setPhase('count-in');
            }
            if (clickPlan && attempt === playbackAttemptRef.current) {
              clickSchedulerRef.current?.start(
                anchor,
                clickPlan.clicks,
                phaseRef.current === 'buffering' ? positionRef.current : clickPlan.fromMs,
              );
            }
          },
          onBufferingChange: (buffering, scoreTimeSeconds) => {
            if (!owner.isCurrent(attempt)) return;
            owner.setBuffering(buffering, scoreTimeSeconds);
            if (buffering) {
              clickSchedulerRef.current?.stop();
              publishPosition(scoreTimeSeconds * 1000);
            }
            setPhase(phaseRef.current);
          },
          onDraining: () => {
            drainingRef.current = true;
            if (
              owner.isCurrent(attempt) &&
              stateRef.current !== 'paused' &&
              phaseRef.current !== 'count-in'
            ) {
              phaseRef.current = 'draining';
              setPhase('draining');
            }
          },
          onRenderWindowIdleChange: (idle) => {
            if (attempt === playbackAttemptRef.current) setRenderWindowIdle(idle);
          },
          onPlayingChange: (playing) => {
            if (
              playing &&
              attempt === playbackAttemptRef.current &&
              stateRef.current === 'preparing'
            ) {
              const detailed = phaseRef.current;
              publishState('playing');
              if (detailed === 'count-in') {
                phaseRef.current = detailed;
                setPhase(detailed);
              }
            }
          },
          onEnded: () => {
            if (attempt !== playbackAttemptRef.current) return;
            clickSchedulerRef.current?.stop();
            setRenderWindowIdle(true);
            publishPosition(durationRef.current);
            publishState('ended');
          },
        });
        if (
          attempt === playbackAttemptRef.current &&
          (stateRef.current === 'playing' || stateRef.current === 'paused')
        )
          setRenderWindowIdle(true);
      } catch (error) {
        if (attempt !== playbackAttemptRef.current) return;
        if (isAutoplayDenial(error)) {
          clockRef.current = null;
          setRenderWindowIdle(true);
          messageRef.current?.('Playback was blocked. Press Play to try again.');
          publishState('idle');
          return;
        }
        if (
          !compatibilityAttempted &&
          !fallbackBufferRef.current &&
          request.allowFallback !== false
        ) {
          try {
            const fallbackTargetMs =
              stateRef.current === 'playing' ? positionRef.current : targetMs;
            clockRef.current = null;
            publishState('preparing');
            await cancelSynthStream(
              { sourcesRef, iteratorRef, generationRef },
              { awaitCancel: true },
            );
            if (attempt !== playbackAttemptRef.current) return;
            await playFallbackFrom(activeScore, fallbackTargetMs, attempt, true);
            return;
          } catch (fallbackError) {
            if (attempt !== playbackAttemptRef.current) return;
            if (isAutoplayDenial(fallbackError)) {
              setRenderWindowIdle(true);
              messageRef.current?.('Playback was blocked. Press Play to try again.');
              publishState('idle');
              return;
            }
            error = fallbackError;
          }
        }
        setRenderWindowIdle(true);
        messageRef.current?.(error instanceof Error ? error.message : 'Playback could not start.');
        publishState('unavailable');
      } finally {
        preparePerf.end();
      }
    },
    [
      owner,
      sourcesRef,
      iteratorRef,
      generationRef,
      playbackAttemptRef,
      clockRef,
      phaseRef,
      positionRef,
      ensureAudioContext,
      ensureFont,
      playFallbackFrom,
      publishPosition,
      publishState,
      stopFallbackSource,
    ],
  );

  const togglePlayPause = useCallback(async () => {
    const priorState = stateRef.current;
    const pendingStop = pendingStopRef.current;
    let pendingTargetMs: number | null = null;
    if (pendingStop && pendingStop.attempt === playbackAttemptRef.current) {
      pendingTargetMs = pendingStop.targetMs;
      playbackAttemptRef.current += 1;
      pendingStopRef.current = null;
    }
    if (pendingTargetMs !== null) {
      await playFrom(pendingTargetMs);
      return;
    }
    if (priorState === 'preparing') {
      await stopAt(positionRef.current);
      return;
    }
    if (priorState === 'playing') {
      const attempt = playbackAttemptRef.current;
      pausedPhaseRef.current = phaseRef.current;
      if (audioContextRef.current?.state === 'running') await audioContextRef.current.suspend();
      if (!owner.isCurrent(attempt)) return;
      publishState('paused');
      return;
    }
    if (priorState === 'paused' && (iteratorRef.current || fallbackSourceRef.current)) {
      const attempt = playbackAttemptRef.current;
      try {
        if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();
        if (!owner.isCurrent(attempt)) return;
        publishState('playing');
        const detail =
          pausedPhaseRef.current === 'count-in' &&
          clockRef.current &&
          audioContextRef.current &&
          audioContextRef.current.currentTime < clockRef.current.contextTime
            ? 'count-in'
            : drainingRef.current
              ? 'draining'
              : clockRef.current
                ? 'playing'
                : 'buffering';
        phaseRef.current = detail;
        setPhase(detail);
      } catch (error) {
        if (!owner.isCurrent(attempt)) return;
        messageRef.current?.(
          isAutoplayDenial(error)
            ? 'Playback was blocked. Press Play to try again.'
            : error instanceof Error
              ? error.message
              : 'Playback could not resume.',
        );
        publishState(isAutoplayDenial(error) ? 'idle' : 'unavailable');
      }
      return;
    }
    const target =
      pendingTargetMs ?? (priorState === 'ended' ? startRef.current : positionRef.current);
    await playFrom(target, priorState === 'unavailable');
  }, [
    owner,
    playbackAttemptRef,
    iteratorRef,
    clockRef,
    phaseRef,
    positionRef,
    playFrom,
    publishState,
    stopAt,
  ]);

  /** A restart away from the request's own start: a selection iterator cannot start elsewhere, a full stream can. */
  const allowAnyStart = useCallback(() => {
    if (requestRef.current.restartable) return;
    const { click, allowFallback } = requestRef.current;
    requestRef.current = { click, allowFallback };
  }, []);

  const seek = useCallback(
    (targetMs: number) => {
      const priorState = stateRef.current;
      allowAnyStart();
      if (priorState === 'paused') {
        void stopAt(targetMs, 'paused');
        return;
      }
      const shouldResume = priorState === 'playing' || priorState === 'preparing';
      // Continuing playback at a new place is not a fresh start: no count-in.
      void stopAt(targetMs).then((stopped) => {
        if (stopped && shouldResume) void playFrom(targetMs, false, false);
      });
    },
    [allowAnyStart, playFrom, stopAt],
  );

  const reset = useCallback(
    (targetMs: number, durationMs = durationRef.current) => {
      void cancelSynthStream({ sourcesRef, iteratorRef, generationRef });
      clockRef.current = null;
      clickSchedulerRef.current?.stop();
      playbackAttemptRef.current += 1;
      pendingStopRef.current = null;
      setRenderWindowIdle(true);
      releaseFallbackAudio();
      setFallbackMode(false);
      durationRef.current = durationMs;
      startRef.current = targetMs;
      publishPosition(targetMs);
      publishState('idle');
    },
    [
      sourcesRef,
      iteratorRef,
      generationRef,
      playbackAttemptRef,
      clockRef,
      publishPosition,
      publishState,
      releaseFallbackAudio,
    ],
  );

  const prefetchSoundFont = useCallback(
    (signal?: AbortSignal) => soundFontManagerRef.current.prefetch(signal),
    [],
  );

  const dispose = useCallback(async () => {
    // Capture and detach before awaiting: a StrictMode remount/new Play may create a new context.
    const context = audioContextRef.current;
    const gain = gainNodeRef.current;
    const pending = cancel(true);
    audioContextRef.current = null;
    gainNodeRef.current = null;
    clickSchedulerRef.current?.stop();
    clickSchedulerRef.current = null;
    releaseFallbackAudio();
    try {
      gain?.disconnect();
    } catch {
      /* already disconnected */
    }
    await pending;
    if (context && context.state !== 'closed') await context.close().catch(() => {});
  }, [cancel, releaseFallbackAudio]);

  useEffect(
    () => () => {
      void dispose();
    },
    [dispose],
  );

  const priorScoreRef = useRef(options.score);
  useEffect(() => {
    if (priorScoreRef.current === options.score) return;
    priorScoreRef.current = options.score;
    void stopAt(options.startMs);
    releaseFallbackAudio();
    setFallbackMode(false);
    // Options are per project: a new score starts from its own defaults.
    durationOverrideRef.current = null;
    setPlaybackOptionsState(null);
  }, [options.score, options.startMs, releaseFallbackAudio, stopAt]);

  // Switching the click on or off while the music plays takes effect at once (a count-in only applies to a start).
  const clickEnabled = options.click?.enabled ?? false;
  const clickTimeline = options.click?.timeline ?? null;
  useEffect(() => {
    const scheduler = clickSchedulerRef.current;
    if (!clickEnabled) {
      scheduler?.stop();
      return;
    }
    const anchor = clockRef.current;
    const context = audioContextRef.current;
    if (stateRef.current !== 'playing' || !anchor || !context || scheduler?.running) return;
    const clicks = clicksFromTimeline(clickTimeline);
    if (clicks.length === 0) return;
    const live =
      scheduler ?? new ClickScheduler(context, { destination: gainNodeRef.current ?? undefined });
    clickSchedulerRef.current = live;
    live.start(anchor, clicks, positionRef.current);
  }, [clickEnabled, clickTimeline, clockRef, positionRef]);

  useEffect(() => {
    if (state !== 'playing') return;
    let frame = window.requestAnimationFrame(function update() {
      const context = audioContextRef.current;
      const anchor = clockRef.current;
      if (context && anchor) {
        const scoreTime = scoreTimeAt(anchor, context.currentTime);
        if (scoreTime !== null) publishPosition(scoreTime * 1000);
        if (phaseRef.current === 'count-in' && context.currentTime >= anchor.contextTime) {
          phaseRef.current = drainingRef.current ? 'draining' : 'playing';
          setPhase(phaseRef.current);
        }
      }
      frame = window.requestAnimationFrame(update);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [clockRef, phaseRef, publishPosition, state]);

  /**
   * Position-preserving options change. Old-option audio and clicks are retired first; rapid requests coalesce
   * (latest wins) into one transaction; playback resumes at the same musical location without a count-in, and a
   * paused session stays paused at it. Stop or Play during the transaction take precedence over the resume.
   */
  const setPlaybackOptions = useCallback(
    (next: PlaybackOptionsRequest): Promise<PlaybackOptionsChange> => {
      optionsPendingRef.current = next;
      if (optionsRunRef.current) return optionsRunRef.current;
      const run = (async () => {
        const activeScore = scoreRef.current;
        const priorState = stateRef.current;
        const context = audioContextRef.current;
        const fromMs =
          context && clockRef.current
            ? clampScorePosition(
                owner.presentationSeconds(context.currentTime) * 1000,
                durationRef.current,
              )
            : positionRef.current;
        const takePending = () => {
          const pending = optionsPendingRef.current;
          optionsPendingRef.current = null;
          return pending;
        };
        // Older engines play written repeats at 100% only; leave their playback untouched.
        if (!activeScore?.setPlaybackOptions) {
          takePending();
          return unavailableChange(fromMs);
        }
        const resume = priorState === 'playing' || priorState === 'preparing';
        const retired =
          resume || priorState === 'paused'
            ? stopAt(fromMs, resume ? 'preparing' : 'paused')
            : null;
        // Captured after our own stop's attempt: a Stop/Play from now on supersedes the resume.
        const attempt = playbackAttemptRef.current;
        await retired;
        const change = await applyPlaybackOptions(activeScore, fromMs, takePending);
        if (scoreRef.current !== activeScore) return change;
        if (change.accepted) setPlaybackOptionsState(change.accepted);
        if (change.status === 'applied') {
          // Compatibility WAV and any cached duration belong to the previous options revision.
          releaseFallbackAudio();
          setFallbackMode(false);
          if (change.timeline) {
            durationOverrideRef.current = {
              score: activeScore,
              hostMs: optionsRef.current.durationMs,
              durationMs: change.timeline.durationMs,
            };
            durationRef.current = change.timeline.durationMs;
          }
        }
        if (playbackAttemptRef.current !== attempt) return change;
        publishPosition(change.toMs);
        if (resume) {
          allowAnyStart();
          void playFrom(change.toMs, false, false);
        }
        return change;
      })().finally(() => {
        optionsRunRef.current = null;
      });
      optionsRunRef.current = run;
      return run;
    },
    [
      owner,
      allowAnyStart,
      clockRef,
      positionRef,
      playbackAttemptRef,
      playFrom,
      publishPosition,
      releaseFallbackAudio,
      stopAt,
    ],
  );

  const start = useCallback(
    (request: PlaybackRequest = {}, targetMs = 0) => {
      requestRef.current = request;
      return playFrom(targetMs, true);
    },
    [playFrom],
  );
  const subscribePosition = useCallback((notify: () => void) => {
    subscribers.current.add(notify);
    return () => {
      subscribers.current.delete(notify);
    };
  }, []);

  const awaitRetirement = useCallback(() => owner.drain(), [owner]);

  return {
    start,
    setPlaybackOptions,
    playbackOptions,
    diagnostics: () => owner.diagnostics(),
    awaitRetirement,
    invalidate: releaseFallbackAudio,
    phase,
    phaseRef,
    clockRef,
    audioContextRef,
    subscribePosition,
    state,
    stateRef,
    positionMs,
    positionRef,
    renderWindowIdle,
    fallbackMode,
    togglePlayPause,
    stopAt,
    seek,
    reset,
    dispose,
    prefetchSoundFont,
  };
}
