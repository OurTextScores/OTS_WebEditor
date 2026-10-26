import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { notesInSegment } from '@/lib/playback/notehead-geometry';
import type { Positions } from '@/lib/webmscore-loader';

type Box = Positions['elements'][number];

export const PLAYING_NOTE_COLOR = 'rgb(8 145 178)';

type Mark = { el: SVGElement; fill: string | null; stroke: string | null };

/**
 * Colours the sounding note's head (or rest) in the page's own SVG, instead of drawing a box over it. `box` is the
 * engine's segment box (its x extent and its staff's height, in score units); every note inside it, ledger lines
 * included, is part of the chord. The colour is set on the element and the original fill/stroke put back when the note
 * stops sounding, the page changes or the mode leaves note tracking, so the score's own colouring (selection, voices)
 * is never lost. The SVG node can be replaced under us (the player re-mounts it while it loads), so every render checks
 * that the coloured nodes are still the ones on screen and colours again if not.
 */
export function useNoteheadColor(
  container: RefObject<HTMLElement | null>,
  view: { highlightBox: Box | null; highlightIsNote: boolean },
  currentPage: number,
  svgMarkup: string,
) {
  const box =
    view.highlightIsNote && view.highlightBox?.page === currentPage ? view.highlightBox : null;
  const marked = useRef<Mark[]>([]);
  const applied = useRef<{ key: string; svg: SVGSVGElement } | null>(null);

  const restore = useCallback(() => {
    for (const { el, fill, stroke } of marked.current) {
      if (!el.isConnected) continue;
      if (fill === null) el.removeAttribute('fill');
      else el.setAttribute('fill', fill);
      if (stroke === null) el.removeAttribute('stroke');
      else el.setAttribute('stroke', stroke);
    }
    marked.current = [];
    applied.current = null;
  }, []);

  // Every render, but it only works when the note, the markup or the SVG node changed.
  useEffect(() => {
    const svg = container.current?.querySelector<SVGSVGElement>(':scope > svg') ?? null;
    const key = box ? `${box.id}:${box.page}:${svgMarkup.length}` : '';
    if (applied.current?.key === key && applied.current.svg === svg) return;
    restore();
    if (!box || !svg) return;
    applied.current = { key, svg };
    for (const el of notesInSegment(svg, box)) {
      marked.current.push({
        el,
        fill: el.getAttribute('fill'),
        stroke: el.getAttribute('stroke'),
      });
      el.setAttribute('fill', PLAYING_NOTE_COLOR);
      el.setAttribute('stroke', PLAYING_NOTE_COLOR);
    }
  });

  useEffect(() => restore, [restore]);
}
