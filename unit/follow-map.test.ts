import { describe, expect, it } from 'vitest';
import { buildFollowMapIndex, resolveContinuousCursor } from '@/lib/playback/score-following';
import type { PlaybackFollowMap } from '@/lib/webmscore-loader';

const interval = (
  startMs: number,
  endMs: number,
  xStart: number,
  xEnd: number,
  extra: object = {},
) => ({
  occurrenceIndex: 0,
  measureIndex: 0,
  segmentId: 0,
  startMs,
  endMs,
  geometry: { page: 0, systemId: 0, xStart, xEnd, y: 100, height: 200 },
  ...extra,
});
const map = (intervals: PlaybackFollowMap['intervals']): PlaybackFollowMap => ({
  schemaVersion: 1,
  optionsRevision: 3,
  coordinateSpace: 'page-local-360dpi',
  complete: true,
  durationMs: intervals.at(-1)!.endMs,
  renderDurationMs: intervals.at(-1)!.endMs + 3000,
  spatium: 10,
  pages: [{ page: 0, width: 1000, height: 1400 }],
  intervals,
});

describe('continuous playback cursor', () => {
  // Measure 1: 0–1000 ms from x 100 to 200; a repeat jumps back: 1000–2000 ms from x 100 to 200 again.
  const index = buildFollowMapIndex(
    map([
      interval(0, 1000, 100, 200),
      interval(1000, 2000, 100, 200, { occurrenceIndex: 1, segmentId: 0 }),
    ]),
  );

  it('interpolates within an interval, with the desktop offset and width', () => {
    expect(resolveContinuousCursor(index, 500)).toMatchObject({
      x: 150 - 10,
      width: 4,
      y: 100,
      height: 200,
    });
    expect(index?.optionsRevision).toBe(3);
  });

  it('is half-open and jumps at a repeat instead of sweeping back', () => {
    expect(resolveContinuousCursor(index, 999.9)!.x).toBeCloseTo(190, 1);
    expect(resolveContinuousCursor(index, 1000)!.x).toBe(90);
  });

  it('has no cursor before the first interval and holds at the final barline through the tail', () => {
    expect(resolveContinuousCursor(index, -1)).toBeNull();
    expect(resolveContinuousCursor(index, 5000)!.x).toBe(190);
  });

  it('reports a laid-out-later interval without inventing geometry', () => {
    const partial = buildFollowMapIndex(map([interval(0, 1000, 0, 0, { geometry: null })]));
    expect(resolveContinuousCursor(partial, 10)).toMatchObject({ geometry: false, page: -1 });
  });

  it('rejects maps that break the contract, so the discrete cursor is used', () => {
    expect(buildFollowMapIndex(null)).toBeNull();
    expect(buildFollowMapIndex(map([interval(0, 0, 0, 1)]))).toBeNull();
    expect(
      buildFollowMapIndex(map([interval(1000, 2000, 0, 1), interval(0, 500, 0, 1)])),
    ).toBeNull();
    expect(buildFollowMapIndex(map([interval(0, 1000, Number.NaN, 1)]))).toBeNull();
  });
});
