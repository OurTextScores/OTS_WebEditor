/*
 * The picture a model reads an ink mark from (performer mode, Phase 7c): the printed bars the mark is in, as the editor
 * lays them out, with the performer's ink drawn over them in blue where it belongs. Ink is kept in staff spaces from its
 * anchor (a bar, a staff, a beat), so it is placed again in this layout the way performer mode places it in its own.
 * Without the music (the bar or staff is not laid out here), the bare-staff drawing is used instead.
 */
import type { Annotation } from '../../performer/annotations/annotationModel';
import {
  fromSpaces,
  pageGeometryOf,
  placeAnchor,
  type PageGeometry,
} from '../../performer/annotations/pageGeometry';
import type { EditorCore } from '../core';

/**
 * The ink's colour over the music. Not a theme colour: it is part of the picture the model reads and the prompt names it
 * ("blue"), so it must not follow the interface's theme.
 */
export const INK_OVER_MUSIC = 'rgb(29, 78, 216)';
/** Pixels per staff space in the picture. */
const PIXELS_PER_SPACE = 24;
/** Staff spaces of music around the mark: above and below its staff, and either side. */
const MARGIN_Y = 6;
const MARGIN_X = 3;

export interface MarkPicture {
  /** A standalone SVG: the cropped page with the ink over it. */
  readonly svg: string;
  readonly width: number;
  readonly height: number;
}

/**
 * The cropped page with the ink over it, or null when the mark cannot be placed in this layout. `part` is the staff the
 * mark belongs to here; `pageSvg` is the page its bar is on (saveSvg of `pageOf` this mark).
 */
export function composeMarkPicture(
  pageSvg: string,
  geometry: PageGeometry,
  annotation: Annotation,
  part: number,
): MarkPicture | null {
  if (annotation.kind !== 'ink' || !annotation.points.length) return null;
  const anchor = { ...annotation.anchor, part };
  const placement = placeAnchor(geometry, anchor);
  if (!placement) return null;
  const band = geometry.bands.find(
    (candidate) =>
      candidate.page === placement.page && candidate.part === part && candidate.y === placement.y,
  );
  const bar = geometry.bars.find((candidate) => candidate.index === anchor.bar);
  if (!band || !bar) return null;
  const { space } = placement;
  const ink = annotation.points.map((point) => fromSpaces(placement, point[0], point[1]));
  // The bars the ink spans, on the same system (a stroke can run into the next bar)
  const endBar = annotation.extent
    ? geometry.bars.find(
        (candidate) =>
          candidate.index === annotation.extent!.end.bar &&
          candidate.page === bar.page &&
          candidate.y === bar.y,
      )
    : undefined;
  const xs = ink.map((point) => point[0]);
  const ys = ink.map((point) => point[1]);
  const left = Math.max(0, Math.min(bar.x, ...xs) - MARGIN_X * space);
  const right = Math.min(
    geometry.width,
    Math.max((endBar ?? bar).x + (endBar ?? bar).width, ...xs) + MARGIN_X * space,
  );
  const top = Math.max(0, Math.min(band.y - MARGIN_Y * space, ...ys.map((y) => y - space)));
  const bottom = Math.min(
    geometry.height,
    Math.max(band.y + band.height + MARGIN_Y * space, ...ys.map((y) => y + space)),
  );
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  if (cropWidth <= 0 || cropHeight <= 0) return null;
  const width = Math.round((cropWidth / space) * PIXELS_PER_SPACE);
  const height = Math.round((cropHeight / space) * PIXELS_PER_SPACE);
  const points = ink.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const overlay =
    `<polyline points="${points}" fill="none" stroke="${INK_OVER_MUSIC}" ` +
    `stroke-width="${(space * 0.3).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;
  const open = pageSvg.match(/<svg\b[^>]*>/);
  if (!open || !pageSvg.includes('</svg>')) return null;
  const root =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="${left.toFixed(1)} ${top.toFixed(1)} ${cropWidth.toFixed(1)} ${cropHeight.toFixed(1)}">`;
  const body = pageSvg.slice(open.index! + open[0].length, pageSvg.lastIndexOf('</svg>'));
  return { svg: `${root}${body}${overlay}</svg>`, width, height };
}

/** Which staff a mark belongs to in the view open here (a mark made in a part is that part's staff in the full score). */
export function staffInView(annotation: Annotation, viewing: number): number | null {
  if (annotation.scorePart === viewing) return annotation.anchor.part;
  if (viewing === -1 && annotation.scorePart >= 0)
    return annotation.scorePart + annotation.anchor.part;
  return null;
}

/** The picture as a PNG, in the browser (null without a canvas, or if the SVG does not draw). */
export async function rasterise(
  picture: MarkPicture,
): Promise<{ mediaType: 'image/png'; base64: string } | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  const image = new Image();
  const loaded = new Promise<boolean>((resolve) => {
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
  });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(picture.svg)}`;
  if (!(await loaded)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = picture.width;
  canvas.height = picture.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL('image/png');
  const base64 = url.slice(url.indexOf(',') + 1);
  return base64 ? { mediaType: 'image/png', base64 } : null;
}

/**
 * The editor's layout, read once per review: page geometry, and each page's SVG on demand (cached). Null when the
 * engine cannot say where the music is.
 */
export async function editorLayout(score: NonNullable<EditorCore['score']>) {
  const [measures, segments, bands] = await Promise.all([
    score.measurePositions().catch(() => null),
    score.segmentPositions().catch(() => null),
    Promise.resolve(score.staffSystemBands?.() ?? []).catch(() => []),
  ]);
  const geometry = pageGeometryOf(measures, segments, Array.isArray(bands) ? bands : []);
  if (!geometry) return null;
  const pages = new Map<number, Promise<string>>();
  const pageSvg = (page: number) => {
    if (!pages.has(page)) pages.set(page, score.saveSvg(page, true, false));
    return pages.get(page)!;
  };
  return { geometry, pageSvg };
}

/** The music picture for one ink mark, as a PNG, or null (then the bare-staff drawing is used). */
export async function musicImage(
  layout: NonNullable<Awaited<ReturnType<typeof editorLayout>>>,
  annotation: Annotation,
  viewing: number,
): Promise<{ mediaType: 'image/png'; base64: string } | null> {
  const part = staffInView(annotation, viewing);
  if (part === null || annotation.kind !== 'ink') return null;
  const placement = placeAnchor(layout.geometry, { ...annotation.anchor, part });
  if (!placement) return null;
  const svg = await layout.pageSvg(placement.page).catch(() => '');
  const picture = svg ? composeMarkPicture(svg, layout.geometry, annotation, part) : null;
  return picture ? rasterise(picture) : null;
}
