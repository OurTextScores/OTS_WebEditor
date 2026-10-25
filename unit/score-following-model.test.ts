import { afterEach, describe, expect, it } from 'vitest';
import {
  buildCursorIndex,
  cursorAt,
  getFollowState,
  resetFollowStateForTests,
  resumeFollowing,
  revealScroll,
  seekTimeAt,
  setFollowEnabled,
  suspendFollow,
  updateFollowState,
} from '@/lib/playback/score-following';
import type { PlaybackTimeline, Positions } from '@/lib/webmscore-loader';

const box = (x: number, page = 0, geometryAvailable = true) => ({
  id: 0,
  x,
  y: 100,
  sx: 50,
  sy: 200,
  page: geometryAvailable ? page : -1,
  geometryAvailable,
});
// Three segments on page 0; segment 1 repeats (played at 1000 and 3000).
const segments: Positions = {
  optionsRevision: 2,
  elements: [box(0), box(50), box(100)],
  events: [
    { elid: 0, position: 0 },
    { elid: 1, position: 1000 },
    { elid: 2, position: 2000 },
    { elid: 1, position: 3000 },
  ],
  pageSize: { width: 1000, height: 1400 },
};
const timeline: PlaybackTimeline = {
  schemaVersion: 1,
  durationMs: 4000,
  renderDurationMs: 7000,
  occurrences: [
    { occurrenceIndex: 0, measureIndex: 0, startMs: 0, endMs: 1000 },
    { occurrenceIndex: 1, measureIndex: 1, startMs: 1000, endMs: 2000 },
    { occurrenceIndex: 2, measureIndex: 2, startMs: 2000, endMs: 3000 },
    { occurrenceIndex: 3, measureIndex: 1, startMs: 3000, endMs: 4000 },
  ],
};

afterEach(() => {
  window.localStorage.clear();
  resetFollowStateForTests();
});

describe('discrete playback cursor', () => {
  it('leads with the segment whose start is the latest at or before the time, holding the last one', () => {
    const index = buildCursorIndex(segments, null)!;
    expect(index.kind).toBe('segment');
    expect(index.optionsRevision).toBe(2);
    expect(cursorAt(index, 999)).toMatchObject({ elementId: 0, x: 0, height: 200, geometry: true });
    expect(cursorAt(index, 1000)).toMatchObject({ elementId: 1, x: 50 });
    expect(cursorAt(index, 9999)).toMatchObject({ elementId: 1, startMs: 3000 });
  });

  it('has no cursor before the first event, and none without a usable map', () => {
    const late = {
      ...segments,
      events: segments.events.map((e) => ({ ...e, position: e.position + 500 })),
    };
    expect(cursorAt(buildCursorIndex(late, null), 100)).toBeNull();
    expect(buildCursorIndex(null, null)).toBeNull();
    expect(buildCursorIndex({ ...segments, events: [] }, null)).toBeNull();
  });

  it('falls back to measures, and reports placeholders without inventing geometry', () => {
    const measures: Positions = { ...segments, elements: [box(0), box(0, 0, false), box(0)] };
    const index = buildCursorIndex({ ...segments, elements: [] }, measures)!;
    expect(index.kind).toBe('measure');
    expect(cursorAt(index, 1500)).toMatchObject({ geometry: false, page: -1, x: 0, width: 0 });
  });
});

describe('contextual seek target', () => {
  const index = buildCursorIndex(segments, null);
  it('prefers the pass inside the run now playing, then the next pass, then the first', () => {
    // Playing measure 2 (2000–3000): its run is 0–3000 (measures 0,1,2), so segment 1 seeks to 1000.
    expect(seekTimeAt(index, timeline, 0, { x: 60, y: 150 }, 2500)).toBe(1000);
    // Playing the repeat of measure 1 (3000–4000): the containing run is that pass.
    expect(seekTimeAt(index, timeline, 0, { x: 60, y: 150 }, 3200)).toBe(3000);
    // Without a timeline: next pass at or after now, else the first.
    expect(seekTimeAt(index, null, 0, { x: 60, y: 150 }, 1500)).toBe(3000);
    expect(seekTimeAt(index, null, 0, { x: 60, y: 150 }, 3500)).toBe(1000);
  });

  it('ignores points off laid-out elements and other pages', () => {
    expect(seekTimeAt(index, timeline, 0, { x: 60, y: 50 }, 0)).toBeNull();
    expect(seekTimeAt(index, timeline, 1, { x: 60, y: 150 }, 0)).toBeNull();
  });
});

describe('system following safe region', () => {
  const viewport = { scrollTop: 0, scrollLeft: 0, height: 1000, width: 800 };
  it('does not move while the system is inside the safe band', () => {
    expect(revealScroll({ top: 200, bottom: 600, left: 0, right: 700 }, 300, viewport)).toBeNull();
  });
  it('brings a system below the band near the top, keeping the next one in view', () => {
    expect(revealScroll({ top: 900, bottom: 1300, left: 0, right: 700 }, 300, viewport)).toEqual({
      top: 750,
      left: 0,
    });
  });
  it('reveals the cursor horizontally at high zoom', () => {
    expect(revealScroll({ top: 200, bottom: 600, left: 0, right: 3000 }, 1500, viewport)).toEqual({
      top: 0,
      left: 1260,
    });
  });
});

describe('follow state', () => {
  it('defaults on, remembers the preference, and suspends only an active session until resumed', () => {
    expect(getFollowState().followEnabled).toBe(true);
    suspendFollow();
    expect(getFollowState().suspended).toBe(false);
    updateFollowState({ active: true });
    suspendFollow();
    expect(getFollowState().suspended).toBe(true);
    const requests = getFollowState().revealRequests;
    resumeFollowing();
    expect(getFollowState()).toMatchObject({ suspended: false, revealRequests: requests + 1 });
    setFollowEnabled(false);
    resetFollowStateForTests();
    expect(getFollowState().followEnabled).toBe(false);
  });
});
