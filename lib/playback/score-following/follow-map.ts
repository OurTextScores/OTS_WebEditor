import type { PlaybackFollowMap } from '../../webmscore-loader';

/**
 * The continuous playback cursor, from the engine's follow map. Native code owns the musical semantics (repeat
 * order, tempo, holds, which x a tick sits at); the browser only interpolates linearly *within* one interval, which
 * the engine guarantees is exact (it splits intervals at every tempo-map entry and pause). It never interpolates
 * across intervals, so a system break, page turn, repeat or jump is a jump, not a sweep. Time is half-open
 * `[startMs, endMs)`; before the first interval there is no cursor; after the last it holds at the final barline.
 */
type Interval = PlaybackFollowMap['intervals'][number];

export type FollowMapIndex = {
  intervals: readonly Interval[];
  spatium: number;
  optionsRevision: number;
  complete: boolean;
};

export type ContinuousCursor = {
  geometry: boolean;
  page: number;
  /** Desktop placement: a bar 0.4 spatium wide, one spatium before the interpolated position. */
  x: number;
  width: number;
  y: number;
  height: number;
  systemId: number;
  measureIndex: number;
  segmentId: number | null;
  /** Start of the interval: changes at every boundary, so it identifies a discrete step too. */
  startMs: number;
};

const finite = (...values: number[]) => values.every(Number.isFinite);

/** Validates the map at the boundary; null (use the discrete cursor) when anything is out of contract. */
export function buildFollowMapIndex(
  map: PlaybackFollowMap | null | undefined,
): FollowMapIndex | null {
  if (
    !map ||
    map.schemaVersion !== 1 ||
    !Array.isArray(map.intervals) ||
    map.intervals.length === 0
  )
    return null;
  let previous = -Infinity;
  for (const interval of map.intervals) {
    if (!finite(interval.startMs, interval.endMs) || interval.endMs <= interval.startMs)
      return null;
    if (interval.startMs < previous - 0.5) return null;
    previous = interval.startMs;
    const g = interval.geometry;
    if (g && (!finite(g.xStart, g.xEnd, g.y, g.height) || !Number.isInteger(g.page) || g.page < 0))
      return null;
  }
  return {
    intervals: map.intervals,
    spatium: finite(map.spatium) && map.spatium > 0 ? map.spatium : 0,
    optionsRevision: map.optionsRevision ?? 0,
    complete: map.complete,
  };
}

function intervalAt(intervals: readonly Interval[], timeMs: number): number {
  let low = 0;
  let high = intervals.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (intervals[middle].startMs <= timeMs) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

export function resolveContinuousCursor(
  index: FollowMapIndex | null,
  timeMs: number,
): ContinuousCursor | null {
  if (!index || !Number.isFinite(timeMs)) return null;
  const at = intervalAt(index.intervals, timeMs);
  if (at < 0) return null;
  const interval = index.intervals[at];
  const g = interval.geometry;
  const base = {
    measureIndex: interval.measureIndex,
    segmentId: interval.segmentId,
    startMs: interval.startMs,
  };
  if (!g)
    return { ...base, geometry: false, page: -1, x: 0, width: 0, y: 0, height: 0, systemId: -1 };
  // Inside the interval: linear; past its end (a gap, or the release tail after the last one): hold at its end.
  const progress = Math.min(
    1,
    Math.max(0, (timeMs - interval.startMs) / (interval.endMs - interval.startMs)),
  );
  const x = g.xStart + (g.xEnd - g.xStart) * progress;
  return {
    ...base,
    geometry: true,
    page: g.page,
    x: x - index.spatium,
    width: Math.max(2, 0.4 * index.spatium),
    y: g.y,
    height: g.height,
    systemId: g.systemId,
  };
}
