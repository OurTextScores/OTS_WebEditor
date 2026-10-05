import { useCallback, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { segmentAtTime, sortedSegmentEvents } from '@/lib/playback/note-tracking';
import { readPlayerPreference, writePlayerPreference } from '@/lib/playback/player-preferences';
import type { HighlightMode } from '@/lib/playback/player-message-api';
import type { Positions, Score } from '@/lib/webmscore-loader';

const PREFERENCE_KEY = 'ots-player-highlight';
const UNAVAILABLE = 'Note highlighting is unavailable for this score.';

/** The mode the player opens in: the URL's, else the remembered one, else measures. */
export function initialHighlightMode(requested: string | null): HighlightMode {
  if (requested === 'note') return 'note';
  if (requested === 'measure') return 'measure';
  return readPlayerPreference(PREFERENCE_KEY) === 'note' ? 'note' : 'measure';
}

/** Whether the engine gave positions worth drawing. */
const usable = (positions: Positions | null): Positions | null =>
  positions && positions.elements.length > 0 && positions.events.length > 0 ? positions : null;

/**
 * Note-level highlighting for the embedded player: the mode, the engine's note (ChordRest segment) positions and the
 * message when they are unavailable. The positions are fetched lazily, only when note mode is wanted; any failure falls
 * back to measure highlighting with an inline message, never a broken player.
 */
export function useNoteHighlight(scoreRef: MutableRefObject<Score | null>, initial: HighlightMode) {
  const [mode, setModeState] = useState<HighlightMode>(initial);
  const [segments, setSegments] = useState<Positions | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const modeRef = useRef<HighlightMode>(initial);
  const fetching = useRef(false);

  const setMode = useCallback((next: HighlightMode) => {
    modeRef.current = next;
    setModeState(next);
    writePlayerPreference(PREFERENCE_KEY, next);
  }, []);

  /** Reads the positions from `target`; false (and a message) when it cannot. One read at a time. */
  const fetchSegments = useCallback(
    async (target: Score): Promise<boolean> => {
      if (fetching.current) return false;
      fetching.current = true;
      setLoading(true);
      try {
        const next = usable(await target.segmentPositions().catch(() => null));
        if (scoreRef.current !== target) return false;
        setSegments(next);
        setMessage(next ? '' : UNAVAILABLE);
        return next !== null;
      } finally {
        fetching.current = false;
        if (scoreRef.current === target) setLoading(false);
      }
    },
    [scoreRef],
  );

  const setPreference = useCallback(
    (next: HighlightMode) => {
      if (modeRef.current === next && (next === 'measure' || segments)) return;
      setMode(next);
      const active = scoreRef.current;
      if (next === 'note' && active && !segments) {
        void fetchSegments(active).then((ok) => {
          if (!ok) setMode('measure');
        });
      }
    },
    [fetchSegments, scoreRef, segments, setMode],
  );

  const toggle = useCallback(
    () => setPreference(modeRef.current === 'note' ? 'measure' : 'note'),
    [setPreference],
  );

  /** A new score: forget the old one's positions. */
  const reset = useCallback(() => {
    setSegments(null);
    setMessage('');
  }, []);

  /** The positions of a score that has just loaded, when note mode was asked for up front. */
  const applyLoaded = useCallback(
    (positions: Positions | null) => {
      const next = usable(positions);
      setSegments(next);
      if (!next) {
        setMode('measure');
        setMessage(UNAVAILABLE);
      }
    },
    [setMode],
  );

  return {
    mode,
    modeRef,
    segments,
    loading,
    message,
    dismissMessage: () => setMessage(''),
    fetchSegments,
    setPreference,
    toggle,
    reset,
    applyLoaded,
  };
}

/** What to draw and follow at `positionMs`: the sounding note in note mode, else the sounding measure. */
type Box = Positions['elements'][number];

export function useHighlightView({
  mode,
  segments,
  positionMs,
  currentPage,
  activeMeasure,
}: {
  mode: HighlightMode;
  segments: Positions | null;
  positionMs: number;
  currentPage: number;
  activeMeasure: Box | null;
}) {
  const events = useMemo(() => sortedSegmentEvents(segments), [segments]);
  const active = useMemo(
    () => (mode === 'note' ? segmentAtTime(events, positionMs) : null),
    [events, mode, positionMs],
  );
  const activeNote = active && segments ? (segments.elements[active.segmentId] ?? null) : null;
  const visibleNotes = useMemo(
    () => segments?.elements.filter((element) => element.page === currentPage) ?? [],
    [currentPage, segments],
  );
  return {
    events,
    visibleNotes,
    /** Drives page following and scroll anchoring (the note while its geometry is loading falls back to the measure). */
    followTarget: activeNote ?? activeMeasure,
    highlightBox: mode === 'note' ? (activeNote ?? activeMeasure) : activeMeasure,
    highlightIsNote: mode === 'note' && activeNote !== null,
  };
}
