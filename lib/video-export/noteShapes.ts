import { centreInSegmentBox } from '../playback/note-box-match';
import type { Positions } from '../webmscore-loader';

type Box = Positions['elements'][number];

/** A notehead or rest from the page's SVG: its outline, its transform, and its centre in page (score) units. */
export interface NoteShape {
  /** SVG path data, as the engine wrote it. */
  readonly d: string;
  /** `matrix(a, b, c, d, e, f)`. */
  readonly matrix: readonly [number, number, number, number, number, number];
  readonly cx: number;
  readonly cy: number;
}

const SHAPE = /<path\s+class="(?:Note|Rest)"\s+transform="matrix\(([^)]*)\)"\s+d="([^"]*)"/g;

/** The path data's coordinate pairs; null when it uses commands other than absolute M, L, C and Z. */
function outlineBounds(
  d: string,
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (/[a-zA-Z]/.test(d.replace(/[MLCZ]/g, '').replace(/e[+-]?\d/gi, ''))) return null;
  const numbers = d.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi)?.map(Number) ?? [];
  if (numbers.length < 2) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    minX = Math.min(minX, numbers[i]);
    maxX = Math.max(maxX, numbers[i]);
    minY = Math.min(minY, numbers[i + 1]);
    maxY = Math.max(maxY, numbers[i + 1]);
  }
  return { minX, maxX, minY, maxY };
}

/**
 * The noteheads and rests of one page's SVG. The engine emits each as a flat
 * `<path class="Note" transform="matrix(...)" d="...">`, so a canvas can redraw one in the highlight colour with
 * `Path2D(d)` and the same matrix: no DOM and no re-rasterising the page.
 */
export function parseNoteShapes(svg: string): NoteShape[] {
  const shapes: NoteShape[] = [];
  for (const match of svg.matchAll(SHAPE)) {
    const values = match[1].split(',').map((value) => Number(value.trim()));
    if (values.length !== 6 || values.some((value) => !Number.isFinite(value))) continue;
    const matrix = values as unknown as NoteShape['matrix'];
    const bounds = outlineBounds(match[2]);
    // Centre of the outline's bounds through the matrix; the origin when the path has commands we do not read.
    const localX = bounds ? (bounds.minX + bounds.maxX) / 2 : 0;
    const localY = bounds ? (bounds.minY + bounds.maxY) / 2 : 0;
    shapes.push({
      d: match[2],
      matrix,
      cx: matrix[0] * localX + matrix[2] * localY + matrix[4],
      cy: matrix[1] * localX + matrix[3] * localY + matrix[5],
    });
  }
  return shapes;
}

/** The shapes that sound with `box`: the lit chord. */
export const shapesInBox = (shapes: readonly NoteShape[], box: Box): NoteShape[] =>
  shapes.filter((shape) => centreInSegmentBox(shape.cx, shape.cy, box));
