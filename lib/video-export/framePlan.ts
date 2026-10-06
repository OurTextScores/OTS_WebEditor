import type { PlaybackTimeline, Positions } from '../webmscore-loader';
import { occurrenceAtTime } from '../playback/timeline';
import { segmentAtTime, sortedSegmentEvents } from '../playback/note-tracking';
import {
  easeInOut,
  frameGeometry,
  scrollForRow,
  systemRowsByMeasure,
  type FrameGeometry,
  type VideoLayout,
} from './layout';

type Box = Positions['elements'][number];
export type VideoHighlight = 'measure' | 'note';

export interface FramePlanInput {
  readonly timeline: PlaybackTimeline;
  /** Measure boxes (`measurePositions()`); their ids are the timeline's `measureIndex`. */
  readonly measures: Positions;
  /** Note boxes (`segmentPositions()`); needed only for note highlighting. */
  readonly segments?: Positions | null;
  readonly highlight: VideoHighlight;
  readonly layout: VideoLayout;
  readonly frame: { width: number; height: number };
  readonly fps: number;
  /** Silence before the music (count-in): the picture holds on the first system, with nothing lit. */
  readonly leadInMs?: number;
  /** Extra time after the last note: the ring-out of the audio, shown as the last picture with nothing lit. */
  readonly tailMs?: number;
}

/** What one frame shows. Page and scroll are in score units; the compositor applies `geometry`. */
export interface FrameState {
  readonly page: number;
  readonly scrollY: number;
  /** While a page turns: the page being left, faded out as `progress` goes 0 -> 1. */
  readonly turn: {
    readonly fromPage: number;
    readonly fromScrollY: number;
    readonly progress: number;
  } | null;
  /** The lit measure (measure mode) or lit note (note mode). Null before the music and in the gaps. */
  readonly active: Box | null;
  readonly activeIsNote: boolean;
}

export interface FramePlan {
  readonly geometry: FrameGeometry;
  readonly fps: number;
  readonly frameCount: number;
  readonly durationMs: number;
  /** The state at `timeMs` of the video (lead-in included). */
  readonly at: (timeMs: number) => FrameState;
  /** The pages the video shows, in first-appearance order: what the rasteriser must produce. */
  readonly pagesInOrder: readonly number[];
}

/** How long a scroll or page turn takes, and how far ahead of the music it starts so the line is in place on its beat. */
export const TRANSITION_MS = 450;
export const ANTICIPATE_MS = 250;

interface Stop {
  readonly startMs: number;
  readonly page: number;
  readonly scrollY: number;
}

/**
 * Decides every frame of the video from the timeline alone, with no canvas and no clock: frame i is time i / fps. The
 * picture follows the played measure (page, and in landscape the scroll); the highlight is the played measure or note.
 */
export function buildFramePlan(input: FramePlanInput): FramePlan {
  const { timeline, measures, highlight, fps } = input;
  const leadInMs = Math.max(0, input.leadInMs ?? 0);
  const geometry = frameGeometry(input.layout, input.frame, measures.pageSize);
  const rows = systemRowsByMeasure(measures.elements);
  const measureById = new Map(measures.elements.map((box) => [box.id, box]));
  const noteEvents =
    highlight === 'note' && input.segments ? sortedSegmentEvents(input.segments) : [];

  // Where the picture rests, one stop per change of page or scroll, in played order.
  const stops: Stop[] = [];
  let scroll: number | null = null;
  let lastPage = -1;
  for (const occurrence of timeline.occurrences) {
    const row = rows.get(occurrence.measureIndex);
    if (!row) continue;
    const target: number = scrollForRow(row, row.page === lastPage ? scroll : null, geometry);
    if (row.page !== lastPage || target !== scroll) {
      stops.push({
        startMs: Math.max(0, occurrence.startMs - ANTICIPATE_MS) + leadInMs,
        page: row.page,
        scrollY: target,
      });
    }
    lastPage = row.page;
    scroll = target;
  }
  // The first stop is where the picture starts: it holds from time zero through the lead-in.
  if (stops.length > 0) stops[0] = { ...stops[0], startMs: 0 };

  const pagesInOrder = [...new Set(stops.map((stop) => stop.page))];
  const durationMs = leadInMs + timeline.durationMs + Math.max(0, input.tailMs ?? 0);
  const frameCount = Math.max(1, Math.ceil((durationMs / 1000) * fps));

  const stopIndexAt = (timeMs: number) => {
    let low = 0;
    let high = stops.length - 1;
    let result = 0;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (stops[middle].startMs <= timeMs) {
        result = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    return result;
  };

  const at = (timeMs: number): FrameState => {
    const t = Math.max(0, timeMs);
    const musicMs = t - leadInMs;
    let page = 0;
    let scrollY = 0;
    let turn: FrameState['turn'] = null;
    if (stops.length > 0) {
      const index = stopIndexAt(t);
      const stop = stops[index];
      page = stop.page;
      scrollY = stop.scrollY;
      const previous = stops[index - 1];
      const progress = (t - stop.startMs) / TRANSITION_MS;
      if (previous && progress < 1) {
        if (previous.page === stop.page) {
          scrollY = previous.scrollY + (stop.scrollY - previous.scrollY) * easeInOut(progress);
        } else {
          turn = {
            fromPage: previous.page,
            fromScrollY: previous.scrollY,
            progress: easeInOut(progress),
          };
        }
      }
    }

    let active: Box | null = null;
    let activeIsNote = false;
    if (musicMs >= 0 && musicMs <= timeline.durationMs) {
      const occurrence = occurrenceAtTime(timeline, musicMs);
      const measure = occurrence ? (measureById.get(occurrence.measureIndex) ?? null) : null;
      const segment = noteEvents.length > 0 ? segmentAtTime(noteEvents, musicMs) : null;
      const note =
        segment && input.segments ? (input.segments.elements[segment.segmentId] ?? null) : null;
      active = note ?? measure;
      activeIsNote = note !== null;
    }
    return { page, scrollY, turn, active, activeIsNote };
  };

  return { geometry, fps, frameCount, durationMs, at, pagesInOrder };
}
