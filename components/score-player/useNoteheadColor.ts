import { useEffect, useRef, type RefObject } from 'react';
import { invalidateNoteheadGeometry, notesInSegment } from '@/lib/playback/notehead-geometry';
import type { Positions } from '@/lib/webmscore-loader';
import { NoteColorEffects } from './view-effects';

type Box = Positions['elements'][number];

export const PLAYING_NOTE_COLOR = 'rgb(8 145 178)';
const OWNER = 'player-playback';

/** Apply player-only note color to the current SVG; never alter the score in the engine. */
export function useNoteheadColor(
  container: RefObject<HTMLElement | null>,
  view: { highlightBox: Box | null; highlightIsNote: boolean },
  currentPage: number,
  svgMarkup: string,
) {
  const box =
    view.highlightIsNote && view.highlightBox?.page === currentPage ? view.highlightBox : null;
  const effects = useRef(new NoteColorEffects());
  const applied = useRef<{ key: string; markup: string; svg: SVGSVGElement } | null>(null);
  const observed = useRef<{ host: HTMLElement; observer: MutationObserver } | null>(null);
  const paint = useRef((force: boolean) => {
    void force;
  });

  useEffect(() => {
    // The segment ID belongs to this playback map; coordinates and page are part of the target.
    paint.current = (force) => {
      const svg = container.current?.querySelector<SVGSVGElement>(':scope > svg') ?? null;
      const key = box ? `${box.id}:${box.page}:${box.x}:${box.y}:${box.sx}:${box.sy}` : '';
      if (
        !force &&
        applied.current?.key === key &&
        applied.current.svg === svg &&
        applied.current.markup === svgMarkup
      )
        return;
      if (force && svg) invalidateNoteheadGeometry(svg);
      if (!box || !svg) {
        effects.current.clear(OWNER);
        applied.current = null;
        return;
      }
      effects.current.set(OWNER, notesInSegment(svg, box), {
        color: PLAYING_NOTE_COLOR,
        priority: 0,
      });
      applied.current = { key, markup: svgMarkup, svg };
    };
    paint.current(false);
  });
  useEffect(() => {
    const host = container.current;
    if (observed.current?.host === host) return;
    observed.current?.observer.disconnect();
    observed.current = null;
    if (host) {
      const observer = new MutationObserver(() => paint.current(true));
      observer.observe(host, { childList: true, subtree: true });
      observed.current = { host, observer };
    }
  });
  useEffect(() => {
    const resolver = effects.current;
    return () => {
      observed.current?.observer.disconnect();
      observed.current = null;
      resolver.dispose();
      applied.current = null;
    };
  }, []);
}
