import { useEffect, type MutableRefObject } from 'react';
import { revealScroll } from '@/lib/playback/score-following';

type Refs = {
  viewportRef: MutableRefObject<HTMLDivElement | null>;
  activeMeasureRef: MutableRefObject<SVGRectElement | null>;
  programmaticScrollRef: MutableRefObject<boolean>;
  programmaticScrollTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
};

/**
 * Keeps the active system readable in the player, with the editor's safe-region policy: it scrolls only when the
 * highlighted system leaves the band, not once per note, so note highlighting no longer triggers a smooth scroll
 * for every segment. Programmatic scrolls are flagged so the player's manual-scroll detection ignores them.
 */
export function usePlayerFollowScroll({
  active,
  targetKey,
  refs,
}: {
  active: boolean;
  /** Changes when the highlighted element, page or rendered SVG changes. */
  targetKey: string;
  refs: Refs;
}) {
  const { viewportRef, activeMeasureRef, programmaticScrollRef, programmaticScrollTimerRef } = refs;
  useEffect(() => {
    if (!active) return;
    const frame = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      const activeRect = activeMeasureRef.current;
      if (!viewport || !activeRect) return;
      const viewportBox = viewport.getBoundingClientRect();
      const box = activeRect.getBoundingClientRect();
      const top = viewport.scrollTop + box.top - viewportBox.top;
      const left = viewport.scrollLeft + box.left - viewportBox.left;
      const next = revealScroll(
        { top, bottom: top + box.height, left, right: left + box.width },
        left,
        {
          scrollTop: viewport.scrollTop,
          scrollLeft: viewport.scrollLeft,
          height: viewport.clientHeight,
          width: viewport.clientWidth,
        },
      );
      if (!next) return;
      const reducedMotion =
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      programmaticScrollRef.current = true;
      if (typeof viewport.scrollTo === 'function') {
        viewport.scrollTo({ ...next, behavior: reducedMotion ? 'auto' : 'smooth' });
      } else {
        viewport.scrollTop = next.top;
        viewport.scrollLeft = next.left;
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
  }, [
    active,
    targetKey,
    viewportRef,
    activeMeasureRef,
    programmaticScrollRef,
    programmaticScrollTimerRef,
  ]);
}
