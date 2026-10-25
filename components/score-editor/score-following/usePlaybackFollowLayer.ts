import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import {
  cursorAt,
  getFollowState,
  getFollowStateOnServer,
  revealScroll,
  sameCursor,
  subscribeFollowState,
  suspendFollow,
  updateFollowState,
  type PlaybackCursor,
} from '../../../lib/playback/score-following';
import type { ScoreTransportState } from '../../../lib/playback/use-score-transport';
import type { PlaybackFollowing } from './usePlaybackFollowing';

export type FollowLayerOptions = {
  following: PlaybackFollowing;
  transportState: ScoreTransportState;
  currentPage: number;
  zoom: number;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  scoreWrapperRef: RefObject<HTMLDivElement | null>;
};

/** Keys that scroll the canvas by hand; any of them suspends following, like the wheel or a touch drag. */
const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown']);
const SEEK_MARKER_MS = 700;

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Cursor, page and system following for the editor canvas. Position ticks arrive from the transport's subscription
 * (one per animation frame while playing); this re-renders only when the discrete cursor changes, and never moves
 * focus, selection or the note-input cursor.
 */
export function usePlaybackFollowLayer({
  following,
  transportState,
  currentPage,
  zoom,
  scrollContainerRef,
  scoreWrapperRef,
}: FollowLayerOptions) {
  const [cursor, setCursor] = useState<PlaybackCursor | null>(null);
  const [seekMarker, setSeekMarker] = useState<PlaybackCursor | null>(null);
  const follow = useSyncExternalStore(subscribeFollowState, getFollowState, getFollowStateOnServer);
  const cursorRef = useRef<PlaybackCursor | null>(null);
  const pendingPageRef = useRef<number | null>(null);
  const pageRef = useRef(currentPage);
  const zoomRef = useRef(zoom);
  useLayoutEffect(() => {
    zoomRef.current = zoom;
  });

  const scrollToCursor = useRef((target: PlaybackCursor) => {
    const container = scrollContainerRef.current;
    const wrapper = scoreWrapperRef.current;
    if (!container || !wrapper) return;
    const scale = zoomRef.current;
    const wrapperRect = wrapper.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const originTop = wrapperRect.top - containerRect.top + container.scrollTop;
    const originLeft = wrapperRect.left - containerRect.left + container.scrollLeft;
    const next = revealScroll(
      {
        top: originTop + target.y * scale,
        bottom: originTop + (target.y + target.height) * scale,
        left: originLeft + target.x * scale,
        right: originLeft + (target.x + target.width) * scale,
      },
      originLeft + target.x * scale,
      {
        scrollTop: container.scrollTop,
        scrollLeft: container.scrollLeft,
        height: container.clientHeight,
        width: container.clientWidth,
      },
    );
    if (next) container.scrollTo({ ...next, behavior: reducedMotion() ? 'auto' : 'smooth' });
  });

  /** Moves the page or viewport to the cursor when following (or once, for Jump/Resume). */
  const followCursor = useRef((target: PlaybackCursor | null, reveal: boolean) => {
    const visiblePage = pageRef.current;
    updateFollowState({
      playbackPage: target?.geometry && target.page !== visiblePage ? target.page : null,
    });
    const state = getFollowState();
    if (!target?.geometry || !(reveal || (state.followEnabled && !state.suspended))) return;
    if (target.page !== visiblePage) {
      if (pendingPageRef.current === target.page) return;
      pendingPageRef.current = target.page;
      // The existing asynchronous page navigation (prepared page turns arrive in Phase 6).
      void Promise.resolve(following.goToPageRef.current(target.page))
        .catch(() => undefined)
        .finally(() => {
          // Navigation drops a request while another is in flight; allow a retry once React has committed.
          requestAnimationFrame(() => {
            if (pendingPageRef.current === target.page && pageRef.current !== target.page)
              pendingPageRef.current = null;
          });
        });
      return;
    }
    scrollToCursor.current(target);
  });

  const recompute = useRef(() => {
    const transport = following.transportRef.current;
    const live =
      transport.stateRef.current === 'playing' || transport.stateRef.current === 'paused';
    const next = live ? cursorAt(following.indexRef.current, transport.positionRef.current) : null;
    if (sameCursor(cursorRef.current, next)) return;
    const pageChanged = next?.page !== cursorRef.current?.page || !cursorRef.current;
    const systemChanged = pageChanged || next?.y !== cursorRef.current?.y;
    cursorRef.current = next;
    setCursor(next);
    // System granularity: no viewport work while the cursor walks along one system.
    if (systemChanged) followCursor.current(next, false);
  });

  useEffect(() => {
    const transport = following.transportRef.current;
    const update = recompute.current;
    const unsubscribe = transport.subscribePosition(update);
    following.mapListeners.add(update);
    return () => {
      unsubscribe();
      following.mapListeners.delete(update);
    };
  }, [following]);

  useEffect(() => {
    recompute.current();
  }, [transportState]);

  // A page change we did not ask for, during playback, is the user paging: suspend following.
  useEffect(() => {
    if (pageRef.current === currentPage) return;
    pageRef.current = currentPage;
    if (pendingPageRef.current === currentPage) {
      pendingPageRef.current = null;
      if (cursorRef.current?.page === currentPage) scrollToCursor.current(cursorRef.current);
    } else {
      pendingPageRef.current = null;
      suspendFollow();
    }
    updateFollowState({
      playbackPage:
        cursorRef.current?.geometry && cursorRef.current.page !== currentPage
          ? cursorRef.current.page
          : null,
    });
  }, [currentPage]);

  const revealRequests = useRef(follow.revealRequests);
  useEffect(() => {
    if (revealRequests.current === follow.revealRequests) return;
    revealRequests.current = follow.revealRequests;
    followCursor.current(cursorRef.current, true);
  }, [follow.revealRequests]);

  // Manual scrolling (wheel, touch drag, scroll keys, the scrollbar) suspends following until Resume.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const suspend = () => suspendFollow();
    const onKey = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) suspendFollow();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target === container) suspendFollow();
    };
    container.addEventListener('wheel', suspend, { passive: true });
    container.addEventListener('touchmove', suspend, { passive: true });
    container.addEventListener('keydown', onKey);
    container.addEventListener('pointerdown', onPointerDown);
    return () => {
      container.removeEventListener('wheel', suspend);
      container.removeEventListener('touchmove', suspend);
      container.removeEventListener('keydown', onKey);
      container.removeEventListener('pointerdown', onPointerDown);
    };
  }, [scrollContainerRef]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onSeek = (timeMs: number) => {
      const marker = cursorAt(following.indexRef.current, timeMs);
      setSeekMarker(marker?.geometry ? marker : null);
      clearTimeout(timer);
      timer = setTimeout(() => setSeekMarker(null), SEEK_MARKER_MS);
    };
    following.seekListeners.add(onSeek);
    return () => {
      clearTimeout(timer);
      following.seekListeners.delete(onSeek);
    };
  }, [following]);

  const onPage = (target: PlaybackCursor | null) =>
    target?.geometry && target.page === currentPage ? target : null;
  return {
    cursor: onPage(cursor),
    seekMarker: onPage(seekMarker),
    playing: transportState === 'playing',
  };
}
