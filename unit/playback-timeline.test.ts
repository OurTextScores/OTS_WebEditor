import { describe, expect, it } from 'vitest';
import type { PlaybackTimeline, Positions } from '@/lib/webmscore-loader';
import {
  formatPlaybackTime,
  occurrenceAtTime,
  occurrenceForMeasure,
  timelineFromPositions,
} from '@/lib/playback/timeline';

const timeline: PlaybackTimeline = {
  schemaVersion: 1,
  durationMs: 8_000,
  renderDurationMs: 11_000,
  occurrences: [
    { occurrenceIndex: 0, measureIndex: 0, startMs: 0, endMs: 2_000 },
    { occurrenceIndex: 1, measureIndex: 1, startMs: 2_000, endMs: 4_000 },
    { occurrenceIndex: 2, measureIndex: 0, startMs: 4_000, endMs: 6_000 },
    { occurrenceIndex: 3, measureIndex: 2, startMs: 6_000, endMs: 8_000 },
  ],
};

describe('playback timeline', () => {
  it('maps time to repeat-expanded occurrences with a binary search', () => {
    expect(occurrenceAtTime(timeline, 1_999)?.occurrenceIndex).toBe(0);
    expect(occurrenceAtTime(timeline, 2_000)?.occurrenceIndex).toBe(1);
    expect(occurrenceAtTime(timeline, 7_999)?.measureIndex).toBe(2);
  });

  it('seeks a repeated measure to its next occurrence, then wraps', () => {
    expect(occurrenceForMeasure(timeline, 0, 2_500)?.startMs).toBe(4_000);
    expect(occurrenceForMeasure(timeline, 0, 7_000)?.startMs).toBe(0);
  });

  it('constructs a compatibility timeline from position events', () => {
    const positions = {
      elements: [],
      events: [
        { elid: 1, position: 2_000 },
        { elid: 0, position: 0 },
        { elid: 2, position: 5_000 },
      ],
      pageSize: { width: 100, height: 200 },
    } satisfies Positions;

    expect(timelineFromPositions(positions, 8_000).occurrences).toEqual([
      { occurrenceIndex: 0, measureIndex: 0, startMs: 0, endMs: 2_000 },
      { occurrenceIndex: 1, measureIndex: 1, startMs: 2_000, endMs: 5_000 },
      { occurrenceIndex: 2, measureIndex: 2, startMs: 5_000, endMs: 8_000 },
    ]);
  });

  it('formats short and hour-long durations', () => {
    expect(formatPlaybackTime(62_999)).toBe('1:02');
    expect(formatPlaybackTime(3_662_000)).toBe('1:01:02');
  });
});
