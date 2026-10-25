import { useEffect, type RefObject } from 'react';
import { suspendFollow } from '../../../lib/playback/score-following';

/** Keys that scroll the canvas by hand. */
const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown']);
/** A gesture is judged once its scrolling has settled. */
const SETTLE_MS = 150;

/**
 * Manual scrolling (wheel, touch drag, scroll keys, the scrollbar) suspends following only if, once the scroll has
 * settled, the playback position is no longer in view (Viritura's rule, design §20). Scrolling that keeps it visible
 * leaves following on; the next system change re-applies the safe band as usual.
 */
export function useManualScrollSuspension(
  scrollContainerRef: RefObject<HTMLDivElement | null>,
  isPlaybackVisible: () => boolean,
) {
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = false;
    const judge = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        pending = false;
        if (!isPlaybackVisible()) suspendFollow();
      }, SETTLE_MS);
    };
    const gesture = () => {
      pending = true;
      judge();
    };
    // Keep waiting while a gesture's scrolling (smooth or momentum) is still moving the view.
    const onScroll = () => {
      if (pending) judge();
    };
    const onKey = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) gesture();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target === container) gesture();
    };
    container.addEventListener('wheel', gesture, { passive: true });
    container.addEventListener('touchmove', gesture, { passive: true });
    container.addEventListener('keydown', onKey);
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      container.removeEventListener('wheel', gesture);
      container.removeEventListener('touchmove', gesture);
      container.removeEventListener('keydown', onKey);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('scroll', onScroll);
    };
  }, [scrollContainerRef, isPlaybackVisible]);
}
