import { centreInSegmentBox } from './note-box-match';
import type { Positions } from '../webmscore-loader';

type Centre = { el: SVGElement; x: number; y: number };
const centresBySvg = new WeakMap<SVGSVGElement, Centre[]>();

/** Measure once per engraved SVG, in score units; zoom changes do not invalidate these coordinates. */
function noteCentres(svg: SVGSVGElement): Centre[] {
  const cached = centresBySvg.get(svg);
  if (cached) return cached;
  const view = svg.viewBox.baseVal;
  const frame = svg.getBoundingClientRect();
  if (!view.width || !frame.width) return [];
  const scale = view.width / frame.width;
  const measured = [...svg.querySelectorAll<SVGGraphicsElement>('.Note, .Rest')].map((el) => {
    const rect = el.getBoundingClientRect();
    return {
      el,
      x: view.x + (rect.left + rect.width / 2 - frame.left) * scale,
      y: view.y + (rect.top + rect.height / 2 - frame.top) * scale,
    };
  });
  if (measured.length > 0) centresBySvg.set(svg, measured);
  return measured;
}

/** Same engine segment-box matching for editor/player; no pitch, duration or engraving reconstruction. */
export function notesInSegment(
  svg: SVGSVGElement,
  box: Positions['elements'][number],
): SVGElement[] {
  return noteCentres(svg)
    .filter((note) => centreInSegmentBox(note.x, note.y, box))
    .map((note) => note.el);
}
