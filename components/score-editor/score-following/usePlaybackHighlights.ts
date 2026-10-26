import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import {
  cursorAt,
  getEditorHighlights,
  getEditorHighlightsOnServer,
  subscribeEditorHighlights,
} from '../../../lib/playback/score-following';
import { visualScoreTime } from '../../../lib/playback/presentation-preferences';
import { usePresentationPreferences } from '../../../lib/playback/use-presentation-preferences';
import { notesInSegment } from '../../../lib/playback/notehead-geometry';
import type { FollowLayerOptions } from './usePlaybackFollowLayer';

/** Local presentation only: cached native boxes and SVG geometry; never a worker call or a selection mutation. */
export function usePlaybackHighlights(options: FollowLayerOptions) {
  const preferences = useSyncExternalStore(
    subscribeEditorHighlights,
    getEditorHighlights,
    getEditorHighlightsOnServer,
  );
  usePresentationPreferences();
  const measureRef = useRef<HTMLDivElement | null>(null);
  const measureKey = useRef('');
  const marked = useRef(new Set<SVGElement>());
  const applied = useRef<{ svg: SVGSVGElement; key: string } | null>(null);
  const clear = useCallback(() => {
    marked.current.forEach((el) => el.classList.remove('ots-playback-notehead'));
    marked.current.clear();
    applied.current = null;
  }, []);
  const paint = useRef(() => {});
  useLayoutEffect(() => {
    paint.current = () => {
      const { following, currentPage, scoreWrapperRef } = options;
      const transport = following.transportRef.current;
      const live = ['playing', 'paused'].includes(transport.stateRef.current);
      const measure =
        live && preferences.measure
          ? cursorAt(
              following.measureIndexRef.current,
              visualScoreTime(transport.positionRef.current, 'measure'),
            )
          : null;
      const element = measureRef.current;
      if (element) {
        const visible = measure?.geometry && measure.page === currentPage;
        const nextKey = visible
          ? `${measure.elementId}:${measure.startMs}:${measure.x}:${measure.y}:${measure.width}:${measure.height}`
          : '';
        if (nextKey !== measureKey.current) {
          measureKey.current = nextKey;
          element.style.display = visible ? 'block' : 'none';
        }
        if (visible && element.dataset.box !== nextKey) {
          Object.assign(element.style, {
            left: `${measure.x}px`,
            top: `${measure.y}px`,
            width: `${measure.width}px`,
            height: `${measure.height}px`,
          });
          element.dataset.elementId = String(measure.elementId);
          element.dataset.startMs = String(measure.startMs);
          element.dataset.box = nextKey;
        }
      }
      const index = following.indexRef.current;
      const note =
        live && preferences.noteheads && index?.kind === 'segment'
          ? cursorAt(index, visualScoreTime(transport.positionRef.current, 'cursor'))
          : null;
      const box =
        note?.geometry && note.page === currentPage
          ? index?.positions.elements[note.elementId]
          : null;
      const svg = box ? scoreWrapperRef.current?.querySelector<SVGSVGElement>('svg') : null;
      const key = box ? `${box.id}:${box.x}:${box.y}:${box.sx}:${box.sy}` : '';
      if (applied.current && applied.current.svg === svg && applied.current.key === key) return;
      clear();
      if (!box || !svg) return;
      applied.current = { svg, key };
      for (const el of notesInSegment(svg, box)) {
        el.classList.add('ots-playback-notehead');
        marked.current.add(el);
      }
    };
    paint.current();
  });
  const { following, scoreWrapperRef } = options;
  useEffect(() => {
    const update = () => paint.current();
    const unsubscribe = following.transportRef.current.subscribePosition(update);
    following.mapListeners.add(update);
    const observer = new MutationObserver(update);
    if (scoreWrapperRef.current)
      observer.observe(scoreWrapperRef.current, { childList: true, subtree: true });
    return () => {
      unsubscribe();
      following.mapListeners.delete(update);
      observer.disconnect();
      clear();
    };
  }, [clear, following, scoreWrapperRef]);
  return measureRef;
}
