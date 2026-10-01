import type { Positions } from '../webmscore-loader';

/**
 * Note-level (ChordRest segment) tracking for the embedded score player.
 *
 * The engine's `segmentPositions()` reports one box per ChordRest segment in
 * written order plus repeat-expanded, tempo-aware playback events
 * (`{ elid: segmentIndex, position: playedStartMs }`), using the same
 * `repeatList().utick2utime()` authority as `playbackTimeline()`. This module
 * maps audio-clock time to the active segment the same way `timeline.ts` maps
 * time to the active measure occurrence.
 *
 * A segment id can legitimately appear at several played times (repeats), so
 * time always resolves first and the id second — never the other way round.
 */

export type SortedSegmentEvent = {
  segmentId: number;
  startMs: number;
};

/** Segment events in performance order. Empty when note tracking is unavailable. */
export function sortedSegmentEvents(segments: Positions | null): SortedSegmentEvent[] {
  const elementCount = segments?.elements.length ?? 0;
  return (segments?.events ?? [])
    .filter(
      (event) =>
        Number.isFinite(event.position) &&
        Number.isFinite(event.elid) &&
        event.elid >= 0 &&
        event.elid < elementCount,
    )
    .map((event) => ({ segmentId: event.elid, startMs: Math.max(0, event.position) }))
    .sort((left, right) => left.startMs - right.startMs);
}

export type ActiveSegment = {
  segmentId: number;
  startMs: number;
  /** Start of the next segment event; equals startMs for the final event. */
  endMs: number;
};

/**
 * The segment sounding at `timeMs`: the last event at or before it.
 * Returns null when there are no usable segment events.
 */
export function segmentAtTime(
  events: readonly SortedSegmentEvent[],
  timeMs: number,
): ActiveSegment | null {
  if (events.length === 0) return null;
  const target = Math.max(0, Number.isFinite(timeMs) ? timeMs : 0);
  let low = 0;
  let high = events.length - 1;
  let result = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (events[middle].startMs <= target) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  const event = events[result];
  return {
    segmentId: event.segmentId,
    startMs: event.startMs,
    endMs: Math.max(event.startMs, events[result + 1]?.startMs ?? event.startMs),
  };
}

/**
 * The played time to seek for a visible segment box.
 *
 * One written segment can sound several times (repeats), so prefer the first
 * occurrence at or after the current time — the same rule `occurrenceForMeasure`
 * uses for measures — and fall back to its first occurrence.
 */
export function segmentTimeForId(
  events: readonly SortedSegmentEvent[],
  segmentId: number,
  currentTimeMs: number,
): number | null {
  const matches = events.filter((event) => event.segmentId === segmentId);
  if (matches.length === 0) return null;
  const current = Math.max(0, Number.isFinite(currentTimeMs) ? currentTimeMs : 0);
  return (matches.find((event) => event.startMs >= current) ?? matches[0]).startMs;
}
