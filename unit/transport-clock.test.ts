import { describe, expect, it } from 'vitest';
import { clampScorePosition, scoreTimeAt } from '@/lib/playback/transport-clock';

describe('transport clock', () => {
  it('maps the AudioContext clock to absolute expanded score time', () => {
    const anchor = { contextTime: 10, scoreTimeSeconds: 42 };
    expect(scoreTimeAt(anchor, 12.5)).toBe(44.5);
  });

  it('holds at the anchor while the context clock is suspended or stale', () => {
    const anchor = { contextTime: 10, scoreTimeSeconds: 42 };
    expect(scoreTimeAt(anchor, 10)).toBe(42);
    expect(scoreTimeAt(anchor, 9)).toBe(42);
  });

  it('rejects missing and invalid clock readings', () => {
    expect(scoreTimeAt(null, 10)).toBeNull();
    expect(scoreTimeAt({ contextTime: 1, scoreTimeSeconds: 2 }, Number.NaN)).toBeNull();
  });

  it('clamps UI position to the visible score duration', () => {
    expect(clampScorePosition(-1, 5_000)).toBe(0);
    expect(clampScorePosition(2_500, 5_000)).toBe(2_500);
    expect(clampScorePosition(8_000, 5_000)).toBe(5_000);
  });
});
