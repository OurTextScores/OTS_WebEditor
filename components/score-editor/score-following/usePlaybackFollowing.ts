import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import {
  buildCursorIndex,
  seekTimeAt,
  updateFollowState,
  type CursorIndex,
} from '../../../lib/playback/score-following';
import type { ScoreTransportState } from '../../../lib/playback/use-score-transport';
import type { PlaybackOptions, PlaybackTimeline, Score } from '../../../lib/webmscore-loader';

/** What the following feature needs from the editor's shared transport. */
export type FollowTransport = {
  state: ScoreTransportState;
  stateRef: MutableRefObject<ScoreTransportState>;
  positionRef: MutableRefObject<number>;
  subscribePosition: (notify: () => void) => () => void;
  seek: (targetMs: number) => void;
  playbackOptions: PlaybackOptions | null;
  /** Audio already scheduled ahead of the clock: page preparation spends this cushion. */
  bufferedAheadSeconds: () => number;
};

type Options = {
  score: Score | null;
  transport: FollowTransport;
  currentPage: number;
  /** Prepares a page ahead of the turn (cached, never shown), and the lead it needs. */
  prefetchPage?: (page: number) => void;
  prefetchLeadMs?: () => number;
  /** Page navigation with an intent: following turns pages as `playback`, Jump/Resume as `reveal`. */
  goToPage: (page: number, intent: 'playback' | 'reveal') => Promise<unknown> | void;
};

/** Notes and rests seek on a plain click during playback; everything else keeps its editing meaning. */
const SEEK_TARGET_SELECTOR = '.Note, .Rest, .NoteDot, .Stem, .Hook, .Accidental';

export type SeekClick = {
  target: Element | null;
  point: { x: number; y: number } | null;
  modified: boolean;
  noteInputActive: boolean;
};

/**
 * The stable controller the canvas layer and click handler share. The editor root re-renders only on transport
 * state changes; cursor movement and following happen in `PlaybackFollowLayer`, which reads these refs.
 */
export type PlaybackFollowing = {
  indexRef: MutableRefObject<CursorIndex | null>;
  timelineRef: MutableRefObject<PlaybackTimeline | null>;
  transportRef: MutableRefObject<FollowTransport>;
  currentPageRef: MutableRefObject<number>;
  goToPageRef: MutableRefObject<Options['goToPage']>;
  prefetchRef: MutableRefObject<Pick<Options, 'prefetchPage' | 'prefetchLeadMs'>>;
  /** Bumped when a new map is installed, so the layer recomputes without a position tick (paused, tail). */
  mapListeners: Set<() => void>;
  seekListeners: Set<(timeMs: number) => void>;
  /** Decides synchronously; true when the click was a playback seek and must not select. */
  seekFromClick: (click: SeekClick) => boolean;
};

const ACTIVE: readonly ScoreTransportState[] = ['playing', 'paused'];

/**
 * Loads the engine's segment/measure map for the playing score and publishes the session to the follow store.
 * The map is read once the stream is live (never on the Play critical path), again for a new options revision, and
 * again on a page change while layout is still incomplete (progressive scores gain geometry as pages lay out).
 */
export function usePlaybackFollowing({
  score,
  transport,
  currentPage,
  goToPage,
  prefetchPage,
  prefetchLeadMs,
}: Options) {
  const indexRef = useRef<CursorIndex | null>(null);
  const timelineRef = useRef<PlaybackTimeline | null>(null);
  const transportRef = useRef(transport);
  const currentPageRef = useRef(currentPage);
  const goToPageRef = useRef(goToPage);
  const prefetchRef = useRef<Pick<Options, 'prefetchPage' | 'prefetchLeadMs'>>({});
  useLayoutEffect(() => {
    transportRef.current = transport;
    currentPageRef.current = currentPage;
    goToPageRef.current = goToPage;
    prefetchRef.current = { prefetchPage, prefetchLeadMs };
  });

  const following = useMemo<PlaybackFollowing>(() => {
    const mapListeners = new Set<() => void>();
    const seekListeners = new Set<(timeMs: number) => void>();
    return {
      indexRef,
      timelineRef,
      transportRef,
      currentPageRef,
      goToPageRef,
      prefetchRef,
      mapListeners,
      seekListeners,
      seekFromClick: ({ target, point, modified, noteInputActive }) => {
        const active = transportRef.current;
        if (active.stateRef.current !== 'playing' || modified || noteInputActive || !point)
          return false;
        if (!target?.closest(SEEK_TARGET_SELECTOR)) return false;
        const time = seekTimeAt(
          indexRef.current,
          timelineRef.current,
          currentPageRef.current,
          point,
          active.positionRef.current,
        );
        if (time === null) return false;
        active.seek(time);
        seekListeners.forEach((listener) => listener(time));
        return true;
      },
    };
  }, []);

  const active = ACTIVE.includes(transport.state);
  const revision = transport.playbackOptions?.revision ?? 0;
  const [mapIncomplete, setMapIncomplete] = useState(false);
  const incompletePage = mapIncomplete ? currentPage : -1;
  // Each Play prepares first: a new session re-reads the map (edits since the last one stopped playback).
  // Derived while rendering (React's "adjust state on a prop change" pattern), not in an effect.
  const preparing = transport.state === 'preparing';
  const [sessions, setSessions] = useState({ count: 0, preparing });
  if (sessions.preparing !== preparing)
    setSessions({ count: sessions.count + (preparing ? 1 : 0), preparing });
  const session = sessions.count;

  useEffect(() => {
    updateFollowState({ active, ...(active ? {} : { playbackPage: null, suspended: false }) });
  }, [active]);

  useEffect(() => {
    if (!active || !score) return;
    let current = true;
    void Promise.all([
      score.segmentPositions().catch(() => null),
      score.measurePositions().catch(() => null),
      Promise.resolve(score.playbackTimeline?.() ?? null).catch(() => null),
    ]).then(([segments, measures, timeline]) => {
      if (!current) return;
      indexRef.current = buildCursorIndex(segments, measures);
      timelineRef.current = timeline;
      setMapIncomplete(indexRef.current?.positions.complete === false);
      updateFollowState({ tracking: indexRef.current?.kind ?? 'unavailable' });
      following.mapListeners.forEach((listener) => listener());
    });
    return () => {
      current = false;
    };
    // `active` and `session` together: one read per session; revision and an incomplete page re-read it.
  }, [active, following, incompletePage, revision, score, session]);

  useEffect(() => {
    indexRef.current = null;
    timelineRef.current = null;
    updateFollowState({ tracking: null });
    following.mapListeners.forEach((listener) => listener());
  }, [following, score]);

  return following;
}
