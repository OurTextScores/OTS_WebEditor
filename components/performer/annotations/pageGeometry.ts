import type { Anchor } from './annotationModel';

/*
 * Where the music is on a laid-out page, in the page's own units (the engine's measure and segment positions and
 * staff bands share them), and the conversions between page points and annotation anchors (staff spaces).
 */

export interface PageBarBox {
  readonly index: number;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** The bar's first tick (written), when the engine gives it: its segments run to the next bar's. */
  readonly tick?: number;
}
export interface PageSegment {
  readonly tick: number;
  readonly page: number;
  readonly x: number;
}
export interface PageBand {
  readonly page: number;
  readonly part: number;
  readonly y: number;
  readonly height: number;
}

export interface PageGeometry {
  readonly width: number;
  readonly height: number;
  readonly bars: readonly PageBarBox[];
  readonly segments: readonly PageSegment[];
  readonly bands: readonly PageBand[];
}

/** An anchor's origin on the page and its staff space (page units), as the anchor resolves in this layout. */
export interface Placement {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly space: number;
}

/** How far above or below a system a mark still belongs to it, in staff spaces (fingerings, text, cue marks). */
const REACH_SPACES = 8;

/** The staff bands inside a bar's box (its system), on its page. */
const bandsOf = (geometry: PageGeometry, bar: PageBarBox) =>
  geometry.bands.filter(
    (band) =>
      band.page === bar.page && band.y + band.height >= bar.y && band.y <= bar.y + bar.height,
  );

/** Where `anchor` is in this layout, or null when its bar or part is not laid out (another part, a deleted bar). */
export function placeAnchor(
  geometry: PageGeometry,
  anchor: Anchor,
  barIndex = anchor.bar,
): Placement | null {
  const bar = geometry.bars.find((candidate) => candidate.index === barIndex);
  if (!bar) return null;
  const band = bandsOf(geometry, bar).find((candidate) => candidate.part === anchor.part);
  if (!band) return null;
  let x = bar.x;
  if (anchor.tick !== undefined) {
    // Several segments can share a tick (a system's clef, key and time signature, then its first note): the note's,
    // the last of them, is the one a mark at that beat belongs to
    const segment = geometry.segments.findLast(
      (candidate) =>
        candidate.tick === anchor.tick &&
        candidate.page === bar.page &&
        candidate.x >= bar.x &&
        candidate.x <= bar.x + bar.width,
    );
    if (segment) x = segment.x;
  }
  return { page: bar.page, x, y: band.y, space: band.height / 4 };
}

/**
 * The anchor for a mark made at a page point: the bar under it, the part whose staff is nearest, and for stamps and
 * text the nearest beat in that bar. Null off the music.
 */
export function anchorAt(
  geometry: PageGeometry,
  page: number,
  x: number,
  y: number,
  withTick: boolean,
): { anchor: Anchor; placement: Placement } | null {
  // The bar at this x whose system is nearest, within reach: marks go above and below the staves too
  let bar: PageBarBox | null = null;
  let distance = Infinity;
  for (const candidate of geometry.bars) {
    if (candidate.page !== page || x < candidate.x || x > candidate.x + candidate.width) continue;
    const away =
      y < candidate.y ? candidate.y - y : Math.max(0, y - (candidate.y + candidate.height));
    const band = bandsOf(geometry, candidate)[0];
    const reach = REACH_SPACES * (band ? band.height / 4 : candidate.height / 4);
    if (away <= reach && away < distance) {
      bar = candidate;
      distance = away;
    }
  }
  if (!bar) return null;
  const bands = bandsOf(geometry, bar);
  if (!bands.length) return null;
  const band = bands.reduce((best, candidate) =>
    Math.abs(candidate.y + candidate.height / 2 - y) < Math.abs(best.y + best.height / 2 - y)
      ? candidate
      : best,
  );
  let tick: number | undefined;
  if (withTick) {
    // This bar's own segments: by tick when known (its tick up to the next bar's), since a lower system's segments
    // can share the same x on the page
    const nextTick = geometry.bars.find((candidate) => candidate.index === bar!.index + 1)?.tick;
    const inBar = geometry.segments.filter(
      (s) =>
        s.page === page &&
        s.x >= bar!.x &&
        s.x <= bar!.x + bar!.width &&
        (bar!.tick === undefined ||
          (s.tick >= bar!.tick && (nextTick === undefined || s.tick < nextTick))),
    );
    if (inBar.length)
      tick = inBar.reduce((best, s) => (Math.abs(s.x - x) < Math.abs(best.x - x) ? s : best)).tick;
  }
  const anchor: Anchor = {
    bar: bar.index,
    part: band.part,
    ...(tick === undefined ? {} : { tick }),
  };
  const placement = placeAnchor(geometry, anchor);
  return placement ? { anchor, placement } : null;
}

/** A page point in staff spaces from a placement, and back. */
export const toSpaces = (placement: Placement, x: number, y: number): [number, number] => [
  (x - placement.x) / placement.space,
  (y - placement.y) / placement.space,
];
export const fromSpaces = (placement: Placement, dx: number, dy: number): [number, number] => [
  placement.x + dx * placement.space,
  placement.y + dy * placement.space,
];

type RawPositions = {
  readonly elements: readonly {
    id: number;
    page: number;
    x: number;
    y: number;
    sx: number;
    sy: number;
    writtenTick?: number;
  }[];
  readonly pageSize?: { width: number; height: number };
} | null;

/** The page geometry from the engine's measure positions, segment positions and staff bands (one shared unit). */
export function pageGeometryOf(
  measures: RawPositions,
  segments: RawPositions,
  bands: readonly { page: number; partIndex: number; y: number; height: number }[],
): PageGeometry | null {
  const size = measures?.pageSize;
  if (!measures || !size?.width || !size.height) return null;
  return {
    width: size.width,
    height: size.height,
    bars: measures.elements
      .filter((element) => element.page >= 0)
      .map((element) => ({
        index: element.id,
        page: element.page,
        x: element.x,
        y: element.y,
        width: element.sx,
        height: element.sy,
        tick: element.writtenTick,
      })),
    segments: (segments?.elements ?? [])
      .filter((element) => element.page >= 0 && element.writtenTick !== undefined)
      .map((element) => ({ tick: element.writtenTick!, page: element.page, x: element.x })),
    bands: bands.map((band) => ({
      page: band.page,
      part: band.partIndex,
      y: band.y,
      height: band.height,
    })),
  };
}
