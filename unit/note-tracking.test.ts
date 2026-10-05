import { describe, expect, it } from 'vitest';
import {
  segmentAtTime,
  segmentTimeForId,
  sortedSegmentEvents,
} from '@/lib/playback/note-tracking';
import type { Positions } from '@/lib/webmscore-loader';

const segments = (events: Array<{ elid: number; position: number }>, count = 4): Positions => ({
  elements: Array.from({ length: count }, (_, id) => ({
    id,
    x: id * 25,
    y: 5,
    sx: 8,
    sy: 30,
    page: 0,
  })),
  events,
  pageSize: { width: 500, height: 40 },
});

describe('sortedSegmentEvents', () => {
  it('orders events by played time and drops unusable entries', () => {
    const sorted = sortedSegmentEvents(
      segments([
        { elid: 2, position: 1_500 },
        { elid: 0, position: 0 },
        { elid: 99, position: 100 },
        { elid: -1, position: 200 },
        { elid: 1, position: Number.NaN },
        { elid: 3, position: 500 },
      ]),
    );
    expect(sorted).toEqual([
      { segmentId: 0, startMs: 0 },
      { segmentId: 3, startMs: 500 },
      { segmentId: 2, startMs: 1_500 },
    ]);
  });

  it('returns empty when there is nothing to track', () => {
    expect(sortedSegmentEvents(null)).toEqual([]);
    expect(sortedSegmentEvents(segments([]))).toEqual([]);
  });
});

describe('segmentAtTime', () => {
  const events = [
    { segmentId: 0, startMs: 0 },
    { segmentId: 1, startMs: 500 },
    { segmentId: 2, startMs: 1_000 },
  ];

  it('holds the last started segment through its duration', () => {
    expect(segmentAtTime(events, 0)).toMatchObject({ segmentId: 0, startMs: 0, endMs: 500 });
    expect(segmentAtTime(events, 749)).toMatchObject({ segmentId: 1, endMs: 1_000 });
  });

  it('pins the first segment before it starts and the last one at the end', () => {
    expect(segmentAtTime(events, -50)).toMatchObject({ segmentId: 0 });
    expect(segmentAtTime(events, 9_999)).toMatchObject({
      segmentId: 2,
      startMs: 1_000,
      endMs: 1_000,
    });
  });

  it('returns null without events', () => {
    expect(segmentAtTime([], 100)).toBeNull();
  });
});

describe('segmentTimeForId', () => {
  // One written segment sounding twice: straight through, then the repeat.
  const events = [
    { segmentId: 0, startMs: 0 },
    { segmentId: 1, startMs: 500 },
    { segmentId: 0, startMs: 2_000 },
    { segmentId: 1, startMs: 2_500 },
  ];

  it('prefers the next occurrence at or after the current time', () => {
    expect(segmentTimeForId(events, 0, 100)).toBe(2_000);
    expect(segmentTimeForId(events, 1, 2_600)).toBe(500);
  });

  it('returns null for an unknown segment', () => {
    expect(segmentTimeForId(events, 7, 0)).toBeNull();
  });
});
