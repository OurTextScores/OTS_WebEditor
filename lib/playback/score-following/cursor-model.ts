import type { PlaybackTimeline, Positions } from '../../webmscore-loader';
import {
  hasPositionGeometry,
  sortedSegmentEvents,
  type SortedSegmentEvent,
} from '../note-tracking';

/**
 * Discrete playback cursor: the ChordRest segment (or, as a fallback, the measure) whose played start is the latest at
 * or before the presentation time. This is segment tracking, not sounding-note tracking; it never sweeps through a
 * measure, because engraved widths are not proportional to elapsed time. All geometry is the engine's, in the same
 * page-local units the editor overlays use; nothing is guessed for unlaid pages.
 */
export type CursorKind = 'segment' | 'measure';

export type CursorIndex = {
  kind: CursorKind;
  positions: Positions;
  events: SortedSegmentEvent[];
  /** Options revision the event times use; a different revision means a stale map. */
  optionsRevision: number;
};

export type PlaybackCursor = {
  kind: CursorKind;
  elementId: number;
  startMs: number;
  /** False for a placeholder (progressive layout): timing is known, the page and box are not. */
  geometry: boolean;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

const usable = (positions: Positions | null | undefined): positions is Positions =>
  !!positions &&
  positions.elements.some((element) => hasPositionGeometry(element)) &&
  sortedSegmentEvents(positions).length > 0;

/** Segment positions when they are usable, else measure positions, else null (tracking unavailable). */
export function buildCursorIndex(
  segments: Positions | null | undefined,
  measures: Positions | null | undefined,
): CursorIndex | null {
  const pick = usable(segments)
    ? ('segment' as const)
    : usable(measures)
      ? ('measure' as const)
      : null;
  if (!pick) return null;
  const positions = (pick === 'segment' ? segments : measures)!;
  return {
    kind: pick,
    positions,
    events: sortedSegmentEvents(positions),
    optionsRevision: positions.optionsRevision ?? 0,
  };
}

/** Index of the last event at or before `timeMs`; -1 before the first event (no active interval yet). */
function eventIndexAt(events: readonly SortedSegmentEvent[], timeMs: number): number {
  if (!Number.isFinite(timeMs)) return -1;
  let low = 0;
  let high = events.length - 1;
  let result = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (events[middle].startMs <= timeMs) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return result;
}

/**
 * The cursor at a presentation time. The final event holds through the release tail (there is no imaginary next
 * segment to move into). Before the first event there is no cursor.
 */
export function cursorAt(index: CursorIndex | null, timeMs: number): PlaybackCursor | null {
  if (!index) return null;
  const at = eventIndexAt(index.events, timeMs);
  if (at < 0) return null;
  const event = index.events[at];
  const element = index.positions.elements[event.segmentId];
  if (!element) return null;
  const geometry = hasPositionGeometry(element);
  return {
    kind: index.kind,
    elementId: event.segmentId,
    startMs: event.startMs,
    geometry,
    page: geometry ? element.page : -1,
    x: geometry ? element.x : 0,
    y: geometry ? element.y : 0,
    width: geometry ? element.sx : 0,
    height: geometry ? element.sy : 0,
  };
}

/** Same cursor position: no re-render, no viewport work. */
export const sameCursor = (a: PlaybackCursor | null, b: PlaybackCursor | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.elementId === b.elementId &&
    a.startMs === b.startMs &&
    a.page === b.page &&
    a.x === b.x &&
    a.y === b.y);

/** Played occurrences of the run (no jump in between) that contains `timeMs`, as a time window. */
function containingRun(timeline: PlaybackTimeline, timeMs: number): [number, number] | null {
  const occurrences = timeline.occurrences;
  const current = occurrences.findIndex((o) => timeMs >= o.startMs && timeMs < o.endMs);
  if (current < 0) return null;
  let first = current;
  let last = current;
  while (first > 0 && occurrences[first - 1].measureIndex === occurrences[first].measureIndex - 1)
    first -= 1;
  while (
    last < occurrences.length - 1 &&
    occurrences[last + 1].measureIndex === occurrences[last].measureIndex + 1
  )
    last += 1;
  return [occurrences[first].startMs, occurrences[last].endMs];
}

/**
 * Seek target for a point on a page, during playback. A written element can sound several times; prefer its pass
 * inside the repeat run now playing, otherwise its next pass, otherwise its first. Null when the point is not on a
 * laid-out element of this page.
 */
export function seekTimeAt(
  index: CursorIndex | null,
  timeline: PlaybackTimeline | null,
  page: number,
  point: { x: number; y: number },
  nowMs: number,
): number | null {
  if (!index) return null;
  const elementId = index.positions.elements.findIndex(
    (element) =>
      hasPositionGeometry(element) &&
      element.page === page &&
      point.x >= element.x &&
      point.x < element.x + Math.max(element.sx, 1) &&
      point.y >= element.y &&
      point.y <= element.y + element.sy,
  );
  if (elementId < 0) return null;
  const times = index.events
    .filter((event) => event.segmentId === elementId)
    .map((event) => event.startMs);
  if (times.length === 0) return null;
  const run = timeline ? containingRun(timeline, nowMs) : null;
  const inRun = run ? times.find((time) => time >= run[0] && time < run[1]) : undefined;
  return inRun ?? times.find((time) => time >= nowMs) ?? times[0];
}
