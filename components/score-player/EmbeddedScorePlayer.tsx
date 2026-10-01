'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PlaybackTimeline, Positions, Score } from '@/lib/webmscore-loader';
import { sanitizeEngineSvg } from '@/lib/sanitize-svg';
import { trackEditorAnalyticsEvent } from '@/lib/editor-analytics';
import { loadScoreFromUrl, requestScoreLayoutProgress } from '@/lib/score-loader';
import {
  occurrenceAtTime,
  occurrenceForMeasure,
  timelineFromPositions,
} from '@/lib/playback/timeline';
import {
  segmentAtTime,
  segmentTimeForId,
  sortedSegmentEvents,
} from '@/lib/playback/note-tracking';
import { useScoreTransport } from '@/lib/playback/use-score-transport';
import {
  parsePlayerCommand,
  PLAYER_MESSAGE_VERSION,
  resolveParentOrigin,
  resolvePlayerId,
  type HighlightMode,
} from '@/lib/playback/player-message-api';
import PlayerControls from './PlayerControls';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/**
 * Minimum highlight/click width for a note box, in score units.
 *
 * The engine reports a segment's width from its glyph bboxes, which can be
 * zero when no track element exposes a valid bbox. A zero-width rect is
 * invisible and unclickable, so note geometry gets a sliver floor while the
 * leading cursor line keeps marking the exact segment x. Measure boxes keep
 * their engine widths untouched.
 */
const NOTE_MIN_WIDTH = 12;
const noteBoxWidth = (box: { width?: number; sx: number }) =>
  Math.max(box.width ?? box.sx ?? 0, NOTE_MIN_WIDTH);
const pageCountBucket = (count: number) => (count <= 1 ? '1' : count <= 5 ? '2_to_5' : '6_plus');
const durationBucket = (durationMs: number) =>
  durationMs < 30_000
    ? 'under_30s'
    : durationMs < 120_000
      ? '30s_to_2m'
      : durationMs < 600_000
        ? '2m_to_10m'
        : '10m_plus';

export default function EmbeddedScorePlayer() {
  const searchParams = useSearchParams();
  const generatedId = useId();
  const scoreUrl = searchParams.get('score') ?? '';
  const configuredStartSeconds = Number(searchParams.get('start') ?? 0);
  const initialFollow = searchParams.get('follow') !== '0';
  const requestedHighlight = searchParams.get('highlight');
  const storedHighlight =
    typeof window !== 'undefined' ? window.localStorage.getItem('ots-player-highlight') : null;
  const initialHighlightMode: 'measure' | 'note' =
    requestedHighlight === 'note' || (requestedHighlight !== 'measure' && storedHighlight === 'note')
      ? 'note'
      : 'measure';
  const requestedPlayerId = searchParams.get('playerId');
  const requestedParentOrigin = searchParams.get('parentOrigin');
  const theme = ['light', 'dark'].includes(searchParams.get('theme') ?? '')
    ? searchParams.get('theme')!
    : '';
  const playerId = useMemo(
    () =>
      resolvePlayerId(
        requestedPlayerId,
        `player-${generatedId.replace(/[^A-Za-z0-9._:-]/g, '') || 'default'}`,
      ),
    [generatedId, requestedPlayerId],
  );
  const parentOrigin = useMemo(
    () => resolveParentOrigin(requestedParentOrigin, window.location.origin),
    [requestedParentOrigin],
  );

  const [score, setScore] = useState<Score | null>(null);
  const scoreRef = useRef<Score | null>(null);
  const [svg, setSvg] = useState('');
  const [positions, setPositions] = useState<Positions | null>(null);
  const [timeline, setTimeline] = useState<PlaybackTimeline | null>(null);
  const [title, setTitle] = useState('Score playback');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [progressiveHasMorePages, setProgressiveHasMorePages] = useState(false);
  const [pageLoadBusy, setPageLoadBusy] = useState(false);
  const [pageRequestQueued, setPageRequestQueued] = useState(false);
  const [pageMessage, setPageMessage] = useState('');
  const [pageError, setPageError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [follow, setFollow] = useState(initialFollow);
  const [highlightMode, setHighlightModeState] = useState<'measure' | 'note'>(
    initialHighlightMode,
  );
  const [segments, setSegments] = useState<Positions | null>(null);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const [highlightMessage, setHighlightMessage] = useState('');
  const [volume, setVolume] = useState(1);
  const [audioMessage, setAudioMessage] = useState('');
  const [inputFormat, setInputFormat] = useState('');
  const [hostReady, setHostReady] = useState(false);
  const playerRootRef = useRef<HTMLElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const activeMeasureRef = useRef<SVGRectElement | null>(null);
  const followRef = useRef(initialFollow);
  const highlightModeRef = useRef<'measure' | 'note'>(initialHighlightMode);
  const followResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticScrollRef = useRef(false);
  const programmaticScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadGenerationRef = useRef(0);
  const startMsRef = useRef(0);
  const renderGenerationRef = useRef(0);
  const renderPromiseRef = useRef<Promise<void> | null>(null);
  const renderPromisesRef = useRef(new Set<Promise<void>>());
  const lastRenderedPageRef = useRef<number | null>(null);
  const pageLoadBusyRef = useRef(false);
  const pageRequestNavigateRef = useRef(false);
  const pageLoadGenerationRef = useRef(0);
  const loadStartedAtRef = useRef(0);
  const loadDurationMsRef = useRef(0);
  const playPreparationStartedAtRef = useRef<number | null>(null);
  const transportController = useScoreTransport({
    score,
    durationMs: timeline?.durationMs ?? 0,
    startMs: startMsRef.current,
    volume,
    onMessage: setAudioMessage,
  });
  const {
    state: transport,
    stateRef: transportStateRef,
    positionMs,
    positionRef,
    renderWindowIdle,
    fallbackMode,
    togglePlayPause,
    stopAt,
    seek,
    reset: resetTransport,
    dispose: disposeTransport,
    prefetchSoundFont,
  } = transportController;

  const setFollowPreference = useCallback((next: boolean) => {
    if (followResumeTimerRef.current) clearTimeout(followResumeTimerRef.current);
    followResumeTimerRef.current = null;
    followRef.current = next;
    setFollow(next);
  }, []);

  const setHighlightMode = useCallback((next: 'measure' | 'note') => {
    highlightModeRef.current = next;
    setHighlightModeState(next);
    window.localStorage.setItem('ots-player-highlight', next);
  }, []);

  /**
   * ChordRest segment geometry for note-level tracking. Fetched lazily: the
   * default measure mode never pays the cost or the (historically crash-prone)
   * `segmentPositions` risk. Any failure falls back to measure highlighting
   * with an inline, dismissible message — never a broken player.
   */
  const fetchSegments = useCallback(async (target: Score): Promise<boolean> => {
    setSegmentsLoading(true);
    try {
      const next = await target.segmentPositions().catch(() => null);
      if (scoreRef.current !== target) return false;
      const usable =
        next && next.elements.length > 0 && next.events.length > 0 ? next : null;
      setSegments(usable);
      if (!usable) {
        setHighlightMessage('Note highlighting is unavailable for this score.');
        return false;
      }
      setHighlightMessage('');
      return true;
    } catch {
      if (scoreRef.current !== target) return false;
      setSegments(null);
      setHighlightMessage('Note highlighting is unavailable for this score.');
      return false;
    } finally {
      if (scoreRef.current === target) setSegmentsLoading(false);
    }
  }, []);

  const setHighlightPreference = useCallback(
    (next: HighlightMode) => {
      if (highlightModeRef.current === next && (next === 'measure' || segments)) return;
      setHighlightMode(next);
      if (next === 'note') {
        const activeScore = scoreRef.current;
        if (activeScore && !segments) {
          void fetchSegments(activeScore).then((ok) => {
            if (!ok) setHighlightMode('measure');
          });
        }
      }
    },
    [fetchSegments, segments, setHighlightMode],
  );

  const toggleHighlightMode = useCallback(() => {
    setHighlightPreference(highlightModeRef.current === 'note' ? 'measure' : 'note');
  }, [setHighlightPreference]);

  const suspendFollowTemporarily = useCallback(() => {
    if (!followRef.current && !followResumeTimerRef.current) return;
    if (followResumeTimerRef.current) clearTimeout(followResumeTimerRef.current);
    followRef.current = false;
    setFollow(false);
    followResumeTimerRef.current = setTimeout(() => {
      followResumeTimerRef.current = null;
      followRef.current = true;
      setFollow(true);
    }, 4_000);
  }, []);

  useEffect(() => {
    setFollowPreference(initialFollow);
  }, [initialFollow, setFollowPreference]);

  useEffect(
    () => () => {
      if (followResumeTimerRef.current) clearTimeout(followResumeTimerRef.current);
      if (programmaticScrollTimerRef.current) clearTimeout(programmaticScrollTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const stored = Number(window.localStorage.getItem('ots-player-volume'));
    if (Number.isFinite(stored)) setVolume(clamp(stored, 0, 1));
  }, []);

  useEffect(() => {
    window.localStorage.setItem('ots-player-volume', String(volume));
  }, [volume]);

  const emitPlayerTelemetry = useCallback(
    (eventName: string, properties?: Record<string, string | number | boolean | undefined>) => {
      trackEditorAnalyticsEvent(eventName, {
        surface: 'embedded_player',
        input_format: inputFormat || undefined,
        playback_mode:
          fallbackMode || audioMessage.toLowerCase().includes('compatibility')
            ? 'wav_fallback'
            : 'streaming',
        page_count_bucket: pageCountBucket(pageCount),
        duration_bucket: durationBucket(timeline?.durationMs ?? 0),
        ...properties,
      });
    },
    [audioMessage, fallbackMode, inputFormat, pageCount, timeline?.durationMs],
  );

  const postPlayerEvent = useCallback(
    (
      event: 'ready' | 'statechange' | 'timeupdate' | 'pagechange' | 'ended' | 'error',
      detail?: Record<string, unknown>,
    ) => {
      if (!parentOrigin || window.parent === window) return;
      window.parent.postMessage(
        {
          type: 'ots-player:event',
          version: PLAYER_MESSAGE_VERSION,
          playerId,
          event,
          ...(detail ? { detail } : {}),
        },
        parentOrigin,
      );
    },
    [parentOrigin, playerId],
  );

  useEffect(() => {
    if (!scoreUrl) {
      setLoading(false);
      setError('No score URL was provided.');
      return;
    }
    const controller = new AbortController();
    const generation = ++loadGenerationRef.current;
    loadStartedAtRef.current = performance.now();
    loadDurationMsRef.current = 0;
    const ownedRenderPromises = renderPromisesRef.current;
    let loadedScore: Score | null = null;
    setScore(null);
    setSvg('');
    setPositions(null);
    setSegments(null);
    setHighlightMessage('');
    setTimeline(null);
    setInputFormat('');
    setHostReady(false);
    setProgressiveHasMorePages(false);
    pageLoadGenerationRef.current += 1;
    pageLoadBusyRef.current = false;
    setPageLoadBusy(false);
    setPageRequestQueued(false);
    pageRequestNavigateRef.current = false;
    setPageMessage('');
    setPageError('');
    lastRenderedPageRef.current = null;
    setLoading(true);
    setError('');

    void (async () => {
      try {
        const loadResult = await loadScoreFromUrl(scoreUrl, { signal: controller.signal });
        loadedScore = loadResult.loadedScore;
        if (controller.signal.aborted || loadGenerationRef.current !== generation) {
          loadedScore.destroy();
          loadedScore = null;
          return;
        }

        scoreRef.current = loadedScore;
        setScore(loadedScore);
        const [metadata, pageTotal, measurePositions] = await Promise.all([
          loadedScore.metadata().catch(() => ({})),
          loadedScore.npages
            ? Promise.resolve(loadedScore.npages()).catch(() => 1)
            : Promise.resolve(1),
          loadedScore.measurePositions().catch(() => null),
        ]);
        if (controller.signal.aborted || loadGenerationRef.current !== generation) return;

        const metadataRecord = metadata as Record<string, unknown>;
        if (typeof metadataRecord.title === 'string' && metadataRecord.title.trim()) {
          setTitle(metadataRecord.title.trim());
        }
        const metadataDurationMs =
          typeof metadataRecord.duration === 'number'
            ? Math.max(0, metadataRecord.duration * 1000)
            : 0;
        const nativeTimeline = loadedScore.playbackTimeline
          ? await Promise.resolve(loadedScore.playbackTimeline()).catch(() => null)
          : null;
        const nextTimeline =
          nativeTimeline ?? timelineFromPositions(measurePositions, metadataDurationMs);
        setPositions(measurePositions);
        setTimeline(nextTimeline);
        if (highlightModeRef.current === 'note') {
          const notePositions = await loadedScore.segmentPositions().catch(() => null);
          if (controller.signal.aborted || loadGenerationRef.current !== generation) return;
          const usable =
            notePositions && notePositions.elements.length > 0 && notePositions.events.length > 0
              ? notePositions
              : null;
          setSegments(usable);
          if (!usable) {
            setHighlightMode('measure');
            setHighlightMessage('Note highlighting is unavailable for this score.');
          }
        }
        setInputFormat(loadResult.format);
        loadDurationMsRef.current = Math.max(
          0,
          Math.round(performance.now() - loadStartedAtRef.current),
        );
        const availablePages = loadResult.progressivePaging
          ? loadResult.initialAvailablePages
          : Number(pageTotal);
        setPageCount(Math.max(1, availablePages || 1));
        setProgressiveHasMorePages(loadResult.progressivePaging && loadResult.progressiveHasMore);
        const requestedStart = Number.isFinite(configuredStartSeconds)
          ? configuredStartSeconds * 1000
          : 0;
        const initialPosition = clamp(requestedStart, 0, nextTimeline.durationMs);
        startMsRef.current = initialPosition;
        resetTransport(initialPosition, nextTimeline.durationMs);
        const initialOccurrence = occurrenceAtTime(nextTimeline, initialPosition);
        const initialPage =
          initialOccurrence && measurePositions
            ? (measurePositions.elements[initialOccurrence.measureIndex]?.page ?? 0)
            : 0;
        setCurrentPage(clamp(initialPage, 0, Math.max(0, Number(pageTotal) - 1)));

        void prefetchSoundFont(controller.signal).catch(() => null);
        setLoading(false);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : 'The score could not be loaded.');
        setLoading(false);
        loadedScore?.destroy();
        loadedScore = null;
      }
    })();

    return () => {
      controller.abort();
      loadGenerationRef.current += 1;
      const ownedScore = loadedScore;
      renderGenerationRef.current += 1;
      const pendingRenders = [...ownedRenderPromises];
      void Promise.allSettled([disposeTransport(), ...pendingRenders]).finally(() => {
        ownedScore?.destroy();
        if (scoreRef.current === ownedScore) scoreRef.current = null;
      });
    };
  }, [
    configuredStartSeconds,
    disposeTransport,
    loadAttempt,
    prefetchSoundFont,
    resetTransport,
    scoreUrl,
    setHighlightMode,
  ]);

  useEffect(() => {
    if (!score) return;
    const generation = ++renderGenerationRef.current;
    const renderPromise = score
      .saveSvg(currentPage, true, false)
      .then((rendered) => {
        if (renderGenerationRef.current === generation) {
          setSvg(sanitizeEngineSvg(rendered));
          lastRenderedPageRef.current = currentPage;
        }
      })
      .catch((renderError) => {
        if (renderGenerationRef.current === generation) {
          const message =
            renderError instanceof Error
              ? renderError.message
              : 'This score page could not be rendered.';
          const lastRenderedPage = lastRenderedPageRef.current;
          if (lastRenderedPage === null) {
            setError(message);
          } else {
            setPageError(message);
            if (lastRenderedPage !== currentPage) setCurrentPage(lastRenderedPage);
          }
        }
      });
    renderPromiseRef.current = renderPromise;
    renderPromisesRef.current.add(renderPromise);
    void renderPromise.finally(() => {
      if (renderPromiseRef.current === renderPromise) renderPromiseRef.current = null;
      renderPromisesRef.current.delete(renderPromise);
    });
  }, [currentPage, score]);

  const activeOccurrence = useMemo(
    () => occurrenceAtTime(timeline, positionMs),
    [positionMs, timeline],
  );
  const activeMeasure =
    activeOccurrence && positions
      ? (positions.elements[activeOccurrence.measureIndex] ?? null)
      : null;

  const segmentEvents = useMemo(() => sortedSegmentEvents(segments), [segments]);
  const activeSegment = useMemo(
    () => (highlightMode === 'note' ? segmentAtTime(segmentEvents, positionMs) : null),
    [highlightMode, positionMs, segmentEvents],
  );
  const activeSegmentBox =
    activeSegment && segments ? (segments.elements[activeSegment.segmentId] ?? null) : null;
  /**
   * Box that drives page following and scroll anchoring: the sounding note in
   * note mode, the sounding measure otherwise — or while note geometry is
   * still loading or unavailable.
   */
  const followTarget = activeSegmentBox ?? activeMeasure;
  const highlightBox = highlightMode === 'note' ? (activeSegmentBox ?? activeMeasure) : activeMeasure;
  const highlightTestId =
    highlightMode === 'note' && activeSegmentBox
      ? 'active-note-highlight'
      : 'active-measure-highlight';

  const visibleMeasures = useMemo(
    () => positions?.elements.filter((element) => element.page === currentPage) ?? [],
    [currentPage, positions],
  );
  const visibleSegments = useMemo(
    () => segments?.elements.filter((element) => element.page === currentPage) ?? [],
    [currentPage, segments],
  );
  const hasPlaybackFailure =
    transport === 'unavailable' || audioMessage.startsWith('Playback was blocked.');

  const readyScoreRef = useRef<Score | null>(null);
  useEffect(() => {
    if (!score || loading || error || !svg || readyScoreRef.current === score) return;
    readyScoreRef.current = score;
    postPlayerEvent('ready', {
      durationMs: timeline?.durationMs ?? 0,
      pageCount,
    });
    emitPlayerTelemetry('score_player_loaded', {
      load_duration_ms: loadDurationMsRef.current,
    });
    setHostReady(true);
  }, [
    emitPlayerTelemetry,
    error,
    loading,
    pageCount,
    postPlayerEvent,
    score,
    svg,
    timeline?.durationMs,
  ]);

  useEffect(() => {
    if (!hostReady) return;
    postPlayerEvent('statechange', {
      state: transport,
      positionMs: positionRef.current,
      durationMs: timeline?.durationMs ?? 0,
      compatibilityAudio: fallbackMode,
    });
  }, [fallbackMode, hostReady, positionRef, postPlayerEvent, timeline?.durationMs, transport]);

  const previousTransportRef = useRef(transport);
  useEffect(() => {
    const previous = previousTransportRef.current;
    previousTransportRef.current = transport;
    if (transport === previous) return;
    if (transport === 'preparing') {
      playPreparationStartedAtRef.current = performance.now();
      return;
    }
    if (transport === 'playing') {
      const preparationStartedAt = playPreparationStartedAtRef.current;
      emitPlayerTelemetry('score_player_play_started', {
        play_preparation_duration_ms:
          preparationStartedAt === null
            ? 0
            : Math.max(0, Math.round(performance.now() - preparationStartedAt)),
        resumed: previous === 'paused',
      });
      playPreparationStartedAtRef.current = null;
    } else if (transport === 'paused') {
      emitPlayerTelemetry('score_player_paused');
    } else if (transport === 'ended') {
      emitPlayerTelemetry('score_player_completed');
    }
  }, [emitPlayerTelemetry, transport]);

  const lastTimeUpdateRef = useRef(0);
  useEffect(() => {
    if (!hostReady || transport !== 'playing') return;
    const now = Date.now();
    if (now - lastTimeUpdateRef.current < 250) return;
    lastTimeUpdateRef.current = now;
    postPlayerEvent('timeupdate', { positionMs, durationMs: timeline?.durationMs ?? 0 });
  }, [hostReady, positionMs, postPlayerEvent, timeline?.durationMs, transport]);

  useEffect(() => {
    if (hostReady) postPlayerEvent('pagechange', { page: currentPage + 1, pageCount });
  }, [currentPage, hostReady, pageCount, postPlayerEvent]);

  useEffect(() => {
    if (hostReady && transport === 'ended') postPlayerEvent('ended', { positionMs });
  }, [hostReady, positionMs, postPlayerEvent, transport]);

  const lastPostedErrorRef = useRef('');
  useEffect(() => {
    const message = error || pageError || (hasPlaybackFailure ? audioMessage : '');
    if (!message) {
      lastPostedErrorRef.current = '';
      return;
    }
    if (message === lastPostedErrorRef.current) return;
    lastPostedErrorRef.current = message;
    postPlayerEvent('error', {
      category: error ? 'score' : pageError ? 'page' : 'audio',
      message,
    });
    emitPlayerTelemetry('score_player_error', {
      error_category: error ? 'score' : pageError ? 'page' : 'audio',
      load_duration_ms:
        error && loadStartedAtRef.current > 0
          ? Math.max(
              loadDurationMsRef.current,
              Math.round(performance.now() - loadStartedAtRef.current),
            )
          : undefined,
    });
  }, [audioMessage, emitPlayerTelemetry, error, hasPlaybackFailure, pageError, postPlayerEvent]);

  const handleSeek = useCallback(
    (targetMs: number) => {
      emitPlayerTelemetry('score_player_seeked');
      seek(targetMs);
    },
    [emitPlayerTelemetry, seek],
  );

  useEffect(() => {
    if (!parentOrigin) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== parentOrigin) return;
      const command = parsePlayerCommand(event.data, playerId, timeline?.durationMs ?? 0);
      if (!command) return;
      switch (command.command) {
        case 'play':
          if (!['playing', 'preparing'].includes(transportStateRef.current)) void togglePlayPause();
          break;
        case 'pause':
          if (transportStateRef.current === 'playing') void togglePlayPause();
          break;
        case 'toggle':
          void togglePlayPause();
          break;
        case 'stop':
          void stopAt(startMsRef.current);
          break;
        case 'seek':
          handleSeek(command.value as number);
          break;
        case 'set-volume':
          setVolume(command.value as number);
          break;
        case 'set-follow':
          setFollowPreference(command.value as boolean);
          break;
        case 'set-highlight':
          setHighlightPreference(command.value as HighlightMode);
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [
    handleSeek,
    parentOrigin,
    playerId,
    setFollowPreference,
    setHighlightPreference,
    stopAt,
    timeline?.durationMs,
    togglePlayPause,
    transportStateRef,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const root = playerRootRef.current;
      const target = event.target;
      if (!root || !(target instanceof HTMLElement) || !root.contains(target)) return;
      const ownsTextInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLButtonElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable;
      if (event.key === ' ' && !ownsTextInput) {
        event.preventDefault();
        void togglePlayPause();
      } else if (event.key === 'Home' && !ownsTextInput) {
        event.preventDefault();
        void stopAt(startMsRef.current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stopAt, togglePlayPause]);

  const loadNextProgressivePage = useCallback(
    async (navigateToPage: boolean) => {
      const activeScore = scoreRef.current;
      if (!activeScore || !progressiveHasMorePages) {
        pageRequestNavigateRef.current = false;
        setPageRequestQueued(false);
        setPageMessage('');
        return;
      }
      if (pageLoadBusyRef.current) return;
      const generation = ++pageLoadGenerationRef.current;
      const nextPage = pageCount;
      pageLoadBusyRef.current = true;
      setPageLoadBusy(true);
      setPageMessage('Preparing next page…');
      setPageError('');
      try {
        await (renderPromiseRef.current ?? Promise.resolve());
        if (scoreRef.current !== activeScore || pageLoadGenerationRef.current !== generation)
          return;
        const progress = await requestScoreLayoutProgress(activeScore, nextPage);
        if (scoreRef.current !== activeScore || pageLoadGenerationRef.current !== generation)
          return;
        setPageCount(Math.max(pageCount, progress.availablePages));
        setProgressiveHasMorePages(progress.hasMorePages);
        if (progress.targetSatisfied) {
          const nextPositions = await activeScore.measurePositions().catch(() => null);
          if (scoreRef.current === activeScore && pageLoadGenerationRef.current === generation) {
            if (nextPositions) setPositions(nextPositions);
            if (navigateToPage) setCurrentPage(nextPage);
          }
          // Segment page indexes follow layout: refresh them once more pages exist.
          if (
            highlightModeRef.current === 'note' &&
            scoreRef.current === activeScore &&
            pageLoadGenerationRef.current === generation
          ) {
            void fetchSegments(activeScore);
          }
        }
      } catch (layoutError) {
        if (pageLoadGenerationRef.current !== generation) return;
        setPageError(
          layoutError instanceof Error
            ? layoutError.message
            : 'The next score page could not be laid out.',
        );
      } finally {
        if (pageLoadGenerationRef.current === generation) {
          pageLoadBusyRef.current = false;
          setPageLoadBusy(false);
          setPageMessage('');
        }
      }
    },
    [fetchSegments, pageCount, progressiveHasMorePages],
  );

  useEffect(() => {
    if (!follow || !activeOccurrence || !progressiveHasMorePages) return;
    const lastKnownMeasureIndex = (positions?.elements.length ?? 0) - 1;
    if (!activeMeasure || activeOccurrence.measureIndex >= Math.max(0, lastKnownMeasureIndex - 1)) {
      pageRequestNavigateRef.current = false;
      setPageRequestQueued(true);
      setPageMessage('Preparing next page…');
    }
  }, [
    activeMeasure,
    activeOccurrence,
    follow,
    positions?.elements.length,
    progressiveHasMorePages,
  ]);

  useEffect(() => {
    if (!follow || !followTarget || followTarget.page === currentPage) return;
    setCurrentPage(followTarget.page);
  }, [currentPage, follow, followTarget]);

  useEffect(() => {
    if (!follow || followTarget?.page !== currentPage || !svg) return;
    const frame = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      const activeRect = activeMeasureRef.current;
      if (!viewport || !activeRect) return;
      const viewportBox = viewport.getBoundingClientRect();
      const measureBox = activeRect.getBoundingClientRect();
      const targetTop = Math.max(
        0,
        viewport.scrollTop + measureBox.top - viewportBox.top - viewport.clientHeight * 0.28,
      );
      const reducedMotion =
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      programmaticScrollRef.current = true;
      if (typeof viewport.scrollTo === 'function') {
        viewport.scrollTo({ top: targetTop, behavior: reducedMotion ? 'auto' : 'smooth' });
      } else {
        viewport.scrollTop = targetTop;
      }
      if (programmaticScrollTimerRef.current) clearTimeout(programmaticScrollTimerRef.current);
      programmaticScrollTimerRef.current = setTimeout(
        () => {
          programmaticScrollRef.current = false;
          programmaticScrollTimerRef.current = null;
        },
        reducedMotion ? 0 : 350,
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentPage, follow, followTarget?.id, followTarget?.page, svg]);

  useEffect(() => {
    if (!pageRequestQueued || pageLoadBusy) return;
    if (!renderWindowIdle) return;
    setPageRequestQueued(false);
    const navigateToPage = pageRequestNavigateRef.current;
    pageRequestNavigateRef.current = false;
    void loadNextProgressivePage(navigateToPage);
  }, [loadNextProgressivePage, pageLoadBusy, pageRequestQueued, renderWindowIdle]);

  useEffect(() => {
    if (progressiveHasMorePages) return;
    pageRequestNavigateRef.current = false;
    setPageRequestQueued(false);
    setPageMessage('');
  }, [progressiveHasMorePages]);

  const pageSize = positions?.pageSize;
  const transportAnnouncement =
    transport === 'playing'
      ? 'Playback started.'
      : transport === 'paused'
        ? 'Playback paused.'
        : transport === 'ended'
          ? 'Playback completed.'
          : '';
  const goToNextPage = () => {
    suspendFollowTemporarily();
    setPageError('');
    const nextPage = currentPage + 1;
    if (nextPage < pageCount) {
      setCurrentPage(nextPage);
      return;
    }
    if (!progressiveHasMorePages || pageLoadBusy) return;
    if (!renderWindowIdle) {
      pageRequestNavigateRef.current = true;
      setPageRequestQueued(true);
      setPageMessage('Preparing next page…');
      return;
    }
    void loadNextProgressivePage(true);
  };

  return (
    <main
      ref={playerRootRef}
      className="ots-score-player flex h-screen min-h-0 flex-col bg-[var(--player-canvas)] text-[var(--player-text)]"
      data-theme={theme || undefined}
      data-testid="embedded-score-player"
      tabIndex={-1}
      onPointerDownCapture={(event) => {
        const target = event.target;
        if (
          !(target instanceof Element) ||
          target.closest('button,input,select,textarea,[contenteditable="true"]')
        )
          return;
        playerRootRef.current?.focus({ preventScroll: true });
      }}
    >
      <h1 className="sr-only">{title}</h1>
      <div
        ref={viewportRef}
        data-testid="player-viewport"
        className="relative min-h-0 flex-1 overflow-auto p-3 sm:p-6"
        onScroll={() => {
          if (programmaticScrollRef.current) return;
          suspendFollowTemporarily();
        }}
      >
        {loading && (
          <div
            className="flex h-full items-center justify-center text-sm text-[var(--player-muted)]"
            role="status"
          >
            Loading score…
          </div>
        )}
        {error && (
          <div
            className="mx-auto mt-10 flex max-w-xl items-center justify-between gap-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800"
            role="status"
          >
            <span>{error}</span>
            {scoreUrl && (
              <button
                type="button"
                className="shrink-0 font-semibold underline"
                onClick={() => setLoadAttempt((value) => value + 1)}
              >
                Retry
              </button>
            )}
          </div>
        )}
        {!loading && !error && (
          <div
            className="mx-auto origin-top"
            style={{ width: `${zoom * 100}%`, maxWidth: zoom <= 1 ? '100%' : 'none' }}
          >
            <div className="relative mx-auto w-full overflow-hidden bg-white shadow-lg">
              <div
                className="[&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
                data-testid="player-svg"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
              {pageSize && (
                <svg
                  data-testid="player-overlay"
                  className="absolute inset-0 h-full w-full"
                  viewBox={`0 0 ${pageSize.width} ${pageSize.height}`}
                  preserveAspectRatio="xMidYMid meet"
                  aria-hidden="true"
                >
                  {(highlightMode === 'note' && segments ? visibleSegments : visibleMeasures).map(
                    (box) => {
                      const isNote = highlightMode === 'note' && segments !== null;
                      const boxWidth = isNote
                        ? noteBoxWidth(box)
                        : (box.width ?? box.sx);
                      return (
                        <rect
                          key={box.id}
                          x={box.x}
                          y={box.y}
                          width={boxWidth}
                          height={box.height ?? box.sy}
                          fill="transparent"
                          pointerEvents="all"
                          className="cursor-pointer"
                          onClick={() => {
                            if (isNote) {
                              const targetMs = segmentTimeForId(
                                segmentEvents,
                                box.id,
                                positionRef.current,
                              );
                              if (targetMs !== null) handleSeek(targetMs);
                              return;
                            }
                            const occurrence = occurrenceForMeasure(
                              timeline,
                              box.id,
                              positionRef.current,
                            );
                            if (occurrence) handleSeek(occurrence.startMs);
                          }}
                        />
                      );
                    },
                  )}
                  {highlightBox?.page === currentPage && (
                    <g pointerEvents="none">
                      <rect
                        data-testid={highlightTestId}
                        ref={activeMeasureRef}
                        x={highlightBox.x}
                        y={highlightBox.y}
                        width={
                          highlightMode === 'note' && activeSegmentBox
                            ? noteBoxWidth(highlightBox)
                            : (highlightBox.width ?? highlightBox.sx)
                        }
                        height={highlightBox.height ?? highlightBox.sy}
                        fill="rgb(8 145 178 / 0.13)"
                        stroke="rgb(8 145 178 / 0.8)"
                        strokeWidth="2"
                      />
                      <line
                        x1={highlightBox.x}
                        y1={highlightBox.y}
                        x2={highlightBox.x}
                        y2={highlightBox.y + (highlightBox.height ?? highlightBox.sy)}
                        stroke="rgb(8 145 178)"
                        strokeWidth="4"
                      />
                    </g>
                  )}
                </svg>
              )}
            </div>
          </div>
        )}
        {audioMessage && (
          <div
            className="pointer-events-none sticky bottom-2 mx-auto mt-2 w-fit rounded-full bg-slate-900/85 px-3 py-1 text-xs text-white"
            role={hasPlaybackFailure ? 'alert' : 'status'}
          >
            {audioMessage}
          </div>
        )}
        {(pageLoadBusy || pageMessage) && (
          <div
            className="pointer-events-none sticky bottom-2 mx-auto mt-2 w-fit rounded-full bg-slate-900/85 px-3 py-1 text-xs text-white"
            role="status"
          >
            {pageMessage || 'Preparing next page…'}
          </div>
        )}
        {pageError && (
          <div
            className="sticky bottom-2 mx-auto mt-2 flex w-fit items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-900"
            role="status"
          >
            <span>{pageError}</span>
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => setPageError('')}
            >
              Dismiss
            </button>
          </div>
        )}
        {highlightMessage && (
          <div className="sticky bottom-2 mx-auto mt-2 flex w-fit items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-900" role="status">
            <span>{highlightMessage}</span>
            <button type="button" className="font-semibold underline" onClick={() => setHighlightMessage('')}>Dismiss</button>
          </div>
        )}
      </div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {transportAnnouncement}
      </div>
      <PlayerControls
        state={transport}
        disabled={loading || Boolean(error) || !score}
        positionMs={positionMs}
        startPositionMs={startMsRef.current}
        durationMs={timeline?.durationMs ?? 0}
        currentMeasureNumber={activeOccurrence ? activeOccurrence.measureIndex + 1 : undefined}
        volume={volume}
        currentPage={currentPage}
        pageCount={pageCount}
        hasMorePages={progressiveHasMorePages}
        follow={follow}
        highlightMode={highlightMode}
        highlightBusy={segmentsLoading}
        onTogglePlayPause={() => void togglePlayPause()}
        onStop={() => void stopAt(startMsRef.current)}
        onSeek={handleSeek}
        onVolume={setVolume}
        onPreviousPage={() => {
          suspendFollowTemporarily();
          setPageError('');
          setCurrentPage((page) => Math.max(0, page - 1));
        }}
        onNextPage={goToNextPage}
        onZoomOut={() => setZoom((value) => clamp(value - 0.1, 0.5, 2.5))}
        onFitWidth={() => setZoom(1)}
        onZoomIn={() => setZoom((value) => clamp(value + 0.1, 0.5, 2.5))}
        onToggleFollow={() => setFollowPreference(!follow)}
        onToggleHighlight={toggleHighlightMode}
      />
    </main>
  );
}
