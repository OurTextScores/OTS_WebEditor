'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaybackTimeline, Score, SynthAudioBatchIterator } from '../webmscore-loader';
import { ClickScheduler, clicksFromTimeline, planClicks } from './click-track';
import { DEFAULT_RENDER_WINDOW } from '../playback-window';
import { SoundFontManager } from './soundfont-manager';
import { cancelSynthStream, scheduleSynthBatchStream } from './stream-scheduler';
import { clampScorePosition, scoreTimeAt, type TransportClockAnchor } from './transport-clock';

export type ScoreTransportState =
  'idle' | 'preparing' | 'playing' | 'paused' | 'ended' | 'unavailable';

const isAutoplayDenial = (error: unknown) =>
  error instanceof DOMException && error.name === 'NotAllowedError';

type Options = {
  score: Score | null;
  durationMs: number;
  startMs: number;
  volume: number;
  onMessage?: (message: string) => void;
  soundFontManager?: SoundFontManager<Score>;
  /** A metronome on the music's own clock, and a count-in before it starts (set by the player's Click and Count-in controls). */
  click?: { enabled: boolean; countIn: boolean; timeline: PlaybackTimeline | null };
};

export function useScoreTransport(options: Options) {
  const [state, setState] = useState<ScoreTransportState>('idle');
  const stateRef = useRef<ScoreTransportState>('idle');
  const [positionMs, setPositionMs] = useState(options.startMs);
  const [renderWindowIdle, setRenderWindowIdle] = useState(true);
  const [fallbackMode, setFallbackMode] = useState(false);
  const positionRef = useRef(options.startMs);
  const scoreRef = useRef(options.score);
  const durationRef = useRef(options.durationMs);
  const startRef = useRef(options.startMs);
  const optionStartRef = useRef(options.startMs);
  const volumeRef = useRef(options.volume);
  const messageRef = useRef(options.onMessage);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const iteratorRef = useRef<SynthAudioBatchIterator | null>(null);
  const playbackAttemptRef = useRef(0);
  const pendingStopRef = useRef<{ attempt: number; targetMs: number } | null>(null);
  const generationRef = useRef(0);
  const clockRef = useRef<TransportClockAnchor | null>(null);
  const clickRef = useRef(options.click);
  const clickSchedulerRef = useRef<ClickScheduler | null>(null);
  const soundFontManagerRef = useRef(options.soundFontManager ?? new SoundFontManager<Score>());
  const fallbackBufferRef = useRef<AudioBuffer | null>(null);
  const fallbackSourceRef = useRef<AudioBufferSourceNode | null>(null);

  scoreRef.current = options.score;
  durationRef.current = options.durationMs;
  if (optionStartRef.current !== options.startMs) {
    optionStartRef.current = options.startMs;
    startRef.current = options.startMs;
  }
  volumeRef.current = options.volume;
  messageRef.current = options.onMessage;
  clickRef.current = options.click;

  const publishState = useCallback((next: ScoreTransportState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const publishPosition = useCallback((next: number) => {
    const clamped = clampScorePosition(next, durationRef.current);
    positionRef.current = clamped;
    setPositionMs(clamped);
  }, []);

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
      await cancelSynthStream({ sourcesRef, iteratorRef, generationRef }, { awaitCancel });
      if (attempt === playbackAttemptRef.current) setRenderWindowIdle(true);
      return attempt;
    },
    [stopFallbackSource],
  );

  const stopAt = useCallback(
    async (targetMs: number, nextState: ScoreTransportState = 'idle') => {
      const attempt = ++playbackAttemptRef.current;
      pendingStopRef.current = { attempt, targetMs };
      clockRef.current = null;
      clickSchedulerRef.current?.stop();
      setRenderWindowIdle(false);
      stopFallbackSource();
      await cancelSynthStream({ sourcesRef, iteratorRef, generationRef }, { awaitCancel: true });
      if (pendingStopRef.current?.attempt === attempt) pendingStopRef.current = null;
      if (attempt !== playbackAttemptRef.current) return false;
      setRenderWindowIdle(true);
      publishPosition(targetMs);
      publishState(nextState);
      return true;
    },
    [publishPosition, publishState, stopFallbackSource],
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
        const wav = await activeScore.saveAudio('wav');
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
      clockRef.current = {
        contextTime: audioContext.currentTime,
        scoreTimeSeconds: targetSeconds,
      };
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
        publishPosition(durationRef.current);
        publishState('ended');
      };
      try {
        source.start(0, targetSeconds);
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
    },
    [ensureAudioContext, publishPosition, publishState, stopFallbackSource],
  );

  const playFrom = useCallback(
    async (targetMs: number, forceRetry = false) => {
      const activeScore = scoreRef.current;
      if (!activeScore?.setSoundFont) {
        setRenderWindowIdle(true);
        messageRef.current?.('Playback is unavailable in this build.');
        publishState('unavailable');
        return;
      }
      const attempt = ++playbackAttemptRef.current;
      setRenderWindowIdle(false);
      publishState('preparing');
      messageRef.current?.('Preparing audio…');
      try {
        const ready = await soundFontManagerRef.current.ensure(activeScore, { forceRetry });
        if (!ready || attempt !== playbackAttemptRef.current) {
          if (!ready && attempt === playbackAttemptRef.current) {
            setRenderWindowIdle(true);
            messageRef.current?.('Playback soundfont is unavailable.');
            publishState('unavailable');
          }
          return;
        }
        if (fallbackBufferRef.current) {
          await playFallbackFrom(activeScore, targetMs, attempt, false);
          return;
        }
        if (!activeScore.synthAudioBatch) {
          await playFallbackFrom(activeScore, targetMs, attempt, true);
          return;
        }
        await cancelSynthStream({ sourcesRef, iteratorRef, generationRef }, { awaitCancel: true });
        if (attempt !== playbackAttemptRef.current) return;
        const audioContext = await ensureAudioContext();
        const iterator = (await activeScore.synthAudioBatch(
          targetMs / 1000,
          2,
        )) as SynthAudioBatchIterator;
        if (attempt !== playbackAttemptRef.current) {
          await iterator(true).catch(() => {});
          return;
        }
        publishPosition(targetMs);
        messageRef.current?.('');
        // A metronome and count-in, when asked for: clicks come from the engine's beat times and share the music's anchor.
        const clickOptions = clickRef.current;
        const clickPlan = clickOptions
          ? planClicks(clickOptions.timeline, targetMs, clickOptions)
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
          renderWindow: DEFAULT_RENDER_WINDOW,
          destination: gainNodeRef.current ?? undefined,
          onClockAnchor: (anchor) => {
            clockRef.current = anchor;
            if (clickPlan && attempt === playbackAttemptRef.current) {
              clickSchedulerRef.current?.start(anchor, clickPlan.clicks, clickPlan.fromMs);
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
            )
              publishState('playing');
          },
          onEnded: () => {
            if (attempt !== playbackAttemptRef.current) return;
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
        if (!fallbackBufferRef.current) {
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
      }
    },
    [ensureAudioContext, playFallbackFrom, publishPosition, publishState],
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
    if (priorState === 'playing') {
      if (audioContextRef.current?.state === 'running') await audioContextRef.current.suspend();
      publishState('paused');
      return;
    }
    if (priorState === 'paused' && iteratorRef.current) {
      try {
        if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();
        publishState('playing');
      } catch (error) {
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
    if (priorState === 'paused' && fallbackSourceRef.current) {
      try {
        if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();
        publishState('playing');
      } catch (error) {
        messageRef.current?.(
          isAutoplayDenial(error)
            ? 'Playback was blocked. Press Play to try again.'
            : error instanceof Error
              ? error.message
              : 'Compatibility audio could not resume.',
        );
        publishState(isAutoplayDenial(error) ? 'idle' : 'unavailable');
      }
      return;
    }
    const target =
      pendingTargetMs ?? (priorState === 'ended' ? startRef.current : positionRef.current);
    await playFrom(target, priorState === 'unavailable');
  }, [playFrom, publishState]);

  const seek = useCallback(
    (targetMs: number) => {
      const priorState = stateRef.current;
      if (priorState === 'paused') {
        void stopAt(targetMs, 'paused');
        return;
      }
      const shouldResume = priorState === 'playing';
      void stopAt(targetMs).then((stopped) => {
        if (stopped && shouldResume) void playFrom(targetMs);
      });
    },
    [playFrom, stopAt],
  );

  const reset = useCallback(
    (targetMs: number, durationMs = durationRef.current) => {
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
    [publishPosition, publishState, releaseFallbackAudio],
  );

  const prefetchSoundFont = useCallback(
    (signal?: AbortSignal) => soundFontManagerRef.current.prefetch(signal),
    [],
  );

  const dispose = useCallback(async () => {
    await cancel(true);
    clickSchedulerRef.current?.stop();
    clickSchedulerRef.current = null;
    const context = audioContextRef.current;
    const gain = gainNodeRef.current;
    audioContextRef.current = null;
    gainNodeRef.current = null;
    releaseFallbackAudio();
    try {
      gain?.disconnect();
    } catch {
      /* already disconnected */
    }
    if (context && context.state !== 'closed') await context.close().catch(() => {});
  }, [cancel, releaseFallbackAudio]);

  useEffect(
    () => () => {
      void dispose();
    },
    [dispose],
  );

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
  }, [clickEnabled, clickTimeline]);

  useEffect(() => {
    if (state !== 'playing') return;
    let frame = window.requestAnimationFrame(function update() {
      const context = audioContextRef.current;
      const anchor = clockRef.current;
      if (context && anchor) {
        const scoreTime = scoreTimeAt(anchor, context.currentTime);
        if (scoreTime !== null) publishPosition(scoreTime * 1000);
      }
      frame = window.requestAnimationFrame(update);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [publishPosition, state]);

  return {
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
