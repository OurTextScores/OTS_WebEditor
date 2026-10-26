import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  autoFollowAllowed,
  continuousCursorAllowed,
  playbackCursorCeiling,
  segmentTrackingAllowed,
} from '../lib/playback/release-gates';
import {
  getFollowState,
  resetFollowStateForTests,
  setFollowEnabled,
} from '../lib/playback/score-following/follow-preferences';

describe('playback release gates', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetFollowStateForTests();
  });

  it('defaults to the full feature set', () => {
    expect(playbackCursorCeiling()).toBe('continuous');
    expect(continuousCursorAllowed()).toBe(true);
    expect(segmentTrackingAllowed()).toBe(true);
    expect(autoFollowAllowed()).toBe(true);
  });

  it('caps the cursor at segments or measures, and ignores unknown values', () => {
    vi.stubEnv('NEXT_PUBLIC_OTS_PLAYBACK_CURSOR', 'segment');
    expect([continuousCursorAllowed(), segmentTrackingAllowed()]).toEqual([false, true]);
    vi.stubEnv('NEXT_PUBLIC_OTS_PLAYBACK_CURSOR', 'measure');
    expect([continuousCursorAllowed(), segmentTrackingAllowed()]).toEqual([false, false]);
    vi.stubEnv('NEXT_PUBLIC_OTS_PLAYBACK_CURSOR', 'smooth');
    expect(playbackCursorCeiling()).toBe('continuous');
  });

  it('turns automatic following off and keeps it off', () => {
    vi.stubEnv('NEXT_PUBLIC_OTS_PLAYBACK_AUTOFOLLOW', '0');
    resetFollowStateForTests();
    expect(getFollowState().followEnabled).toBe(false);
    setFollowEnabled(true);
    expect(getFollowState().followEnabled).toBe(false);
  });
});
