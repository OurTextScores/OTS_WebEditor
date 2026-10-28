import { useEffect, useState, type MutableRefObject, type RefObject } from 'react';
import { svgScreenMapping } from '@/lib/svg-screen-matrix';
import type { Score, ScoreObjectHit } from '@/lib/webmscore-loader';

type Inspection =
  | { status: 'idle' | 'pending' | 'stale' | 'unavailable' | 'error' }
  | { status: 'result'; hit: ScoreObjectHit };

type Props = {
  score: Score | null;
  page: number;
  containerRef: RefObject<HTMLDivElement | null>;
  installGenerationRef: MutableRefObject<number>;
};

/** Diagnostic hover is independent of selection and never consumes pointer or keyboard events. */
export function useScoreGeometryInspection({ score, page, containerRef, installGenerationRef }: Props) {
  const [snapshot, setSnapshot] = useState<{ score: Score | null; page: number; inspection: Inspection }>({
    score: null, page: -1, inspection: { status: 'idle' },
  });

  useEffect(() => {
    const setInspection = (inspection: Inspection) => setSnapshot({ score, page, inspection });
    const container = containerRef.current;
    if (!container || !score) {
      setInspection({ status: 'idle' });
      return;
    }
    let active = true;
    let sequence = 0;
    let inFlight = false;
    let point: { x: number; y: number } | null = null;
    const invalidate = (status: 'idle' | 'stale') => {
      sequence += 1;
      setInspection({ status });
    };
    const query = () => {
      if (!active || !point || inFlight) return;
      const svg = container.querySelector('svg');
      if (!svg || !score.hitTestScoreObject) {
        setInspection({ status: 'unavailable' });
        return;
      }
      const hitTest = score.hitTestScoreObject.bind(score);
      const request = sequence;
      const installGeneration = installGenerationRef.current;
      const target = point;
      inFlight = true;
      setInspection({ status: 'pending' });
      void Promise.resolve().then(() => hitTest(page, target.x, target.y))
        .then((hit) => {
          if (!active || request !== sequence) return;
          if (installGeneration !== installGenerationRef.current || svg !== container.querySelector('svg')) {
            setInspection({ status: 'stale' });
            return;
          }
          setInspection({ status: 'result', hit });
        })
        .catch(() => {
          if (active && request === sequence) setInspection({ status: 'error' });
        })
        .finally(() => {
          inFlight = false;
          if (active && point && request !== sequence) query();
        });
    };
    const onMove = (event: PointerEvent) => {
      if (!event.altKey || !event.shiftKey || event.buttons !== 0) return;
      const svg = container.querySelector('svg');
      const mapping = svg ? svgScreenMapping(svg) : null;
      if (!mapping) {
        point = null;
        invalidate('idle');
        return;
      }
      point = mapping.toEngraving(event.clientX, event.clientY);
      invalidate('stale');
      query();
    };
    const clear = () => {
      point = null;
      invalidate('idle');
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt' || event.key === 'Shift') clear();
    };
    const observer = new MutationObserver(() => {
      invalidate('stale');
      if (point) query();
    });
    observer.observe(container, { childList: true });
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerleave', clear);
    container.addEventListener('pointerdown', clear);
    window.addEventListener('keydown', clear);
    window.addEventListener('keyup', onKeyUp);
    setInspection({ status: 'idle' });
    return () => {
      active = false;
      observer.disconnect();
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerleave', clear);
      container.removeEventListener('pointerdown', clear);
      window.removeEventListener('keydown', clear);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [score, page, containerRef, installGenerationRef]);

  return snapshot.score === score && snapshot.page === page
    ? snapshot.inspection
    : { status: 'idle' as const };
}
