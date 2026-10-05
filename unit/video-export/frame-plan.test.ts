import { describe, expect, it } from 'vitest';
import { ANTICIPATE_MS, TRANSITION_MS, buildFramePlan } from '../../lib/video-export/framePlan';
import { frameGeometry, scrollForRow, systemRowsByMeasure } from '../../lib/video-export/layout';
import type { PlaybackTimeline, Positions } from '../../lib/webmscore-loader';

type Box = Positions['elements'][number];

const PAGE = { width: 2000, height: 3000 };
const measure = (id: number, page: number, x: number, y: number, h = 200): Box => ({
  id,
  page,
  x,
  y,
  sx: 400,
  sy: h,
  width: 400,
  height: h,
});

// Page 0: systems at y=200, 700, 1200, 1700, 2200 (four measures each would be long; two per system keeps it readable).
// Page 1: one system at y=200.
const systemY = [200, 700, 1200, 1700, 2200];
const boxes: Box[] = [
  ...systemY.flatMap((y, row) => [measure(row * 2, 0, 100, y), measure(row * 2 + 1, 0, 600, y)]),
  measure(10, 1, 100, 200),
  measure(11, 1, 600, 200),
];
const measures: Positions = { elements: boxes, events: [], pageSize: PAGE };

const timelineOf = (ids: number[], stepMs = 1000): PlaybackTimeline => ({
  schemaVersion: 1,
  durationMs: ids.length * stepMs,
  renderDurationMs: ids.length * stepMs,
  occurrences: ids.map((measureIndex, index) => ({
    occurrenceIndex: index,
    measureIndex,
    startMs: index * stepMs,
    endMs: (index + 1) * stepMs,
  })),
});

const base = {
  measures,
  highlight: 'measure' as const,
  layout: 'landscape' as const,
  frame: { width: 1000, height: 562 },
  fps: 30,
};

describe('systemRowsByMeasure', () => {
  it('groups measures that share a vertical band into one system, per page', () => {
    const rows = systemRowsByMeasure(boxes);
    expect(rows.get(0)).toBe(rows.get(1));
    expect(rows.get(0)).not.toBe(rows.get(2));
    expect(rows.get(0)).toMatchObject({ page: 0, top: 200, bottom: 400 });
    expect(rows.get(10)).toMatchObject({ page: 1, top: 200 });
  });

  it('keeps staves that merely touch in separate systems', () => {
    const touching = [measure(0, 0, 0, 0, 200), measure(1, 0, 0, 200, 200)];
    const rows = systemRowsByMeasure(touching);
    expect(rows.get(0)).not.toBe(rows.get(1));
  });
});

describe('frameGeometry', () => {
  it('landscape scales to the width and shows a window of the page', () => {
    const g = frameGeometry('landscape', base.frame, PAGE);
    expect(g.scale).toBeCloseTo(0.5);
    expect(g.windowHeight).toBeCloseTo(1124);
    expect(g.offsetX).toBe(0);
  });

  it('portrait fits the whole page and centres it', () => {
    const g = frameGeometry('portrait', { width: 1080, height: 1920 }, PAGE);
    expect(g.scale).toBeCloseTo(0.54);
    expect(g.windowHeight).toBe(PAGE.height);
    expect(g.offsetY).toBeCloseTo((1920 - 3000 * 0.54) / 2);
  });
});

describe('scrollForRow', () => {
  const g = frameGeometry('landscape', base.frame, PAGE);
  const row = (top: number) => ({ page: 0, top, bottom: top + 200 });

  it('does not move while the row is fully visible', () => {
    expect(scrollForRow(row(700), 0, g)).toBe(0);
  });

  it('moves to put the row near the top once it would leave the window', () => {
    const value = scrollForRow(row(1700), 0, g);
    expect(value).toBeGreaterThan(1000);
    expect(value).toBeLessThanOrEqual(1700);
  });

  it('clamps to the page', () => {
    expect(scrollForRow(row(2800), 0, g)).toBe(PAGE.height - g.windowHeight);
    expect(scrollForRow(row(0), 500, g)).toBeGreaterThanOrEqual(0);
  });
});

describe('buildFramePlan', () => {
  const ids = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const plan = buildFramePlan({ ...base, timeline: timelineOf(ids) });

  it('has ceil(duration * fps) frames', () => {
    expect(plan.durationMs).toBe(12_000);
    expect(plan.frameCount).toBe(360);
    const odd = buildFramePlan({ ...base, timeline: timelineOf([0], 1010) });
    expect(odd.frameCount).toBe(Math.ceil(1.01 * 30));
  });

  it('lights the played measure', () => {
    expect(plan.at(0).active?.id).toBe(0);
    expect(plan.at(1_500).active?.id).toBe(1);
    expect(plan.at(11_900).active?.id).toBe(11);
    expect(plan.at(1_500).activeIsNote).toBe(false);
  });

  it('starts on the first page and lists pages in order of appearance', () => {
    expect(plan.at(0).page).toBe(0);
    expect(plan.pagesInOrder).toEqual([0, 1]);
  });

  it('turns the page just before its first measure sounds, crossfading from the old page', () => {
    const turnStart = 10_000 - ANTICIPATE_MS;
    const mid = plan.at(turnStart + TRANSITION_MS / 2);
    expect(mid.page).toBe(1);
    expect(mid.turn).toMatchObject({ fromPage: 0 });
    expect(mid.turn!.progress).toBeGreaterThan(0.3);
    expect(mid.turn!.progress).toBeLessThan(0.7);
    expect(plan.at(turnStart + TRANSITION_MS + 50).turn).toBeNull();
  });

  it('scrolls smoothly between systems on a page and holds otherwise', () => {
    // Measure 8 (system 4, y=2200) is the first one below the window the previous scroll left.
    const settled = plan.at(8_000 + 600).scrollY;
    const before = plan.at(8_000 - ANTICIPATE_MS - 10).scrollY;
    const during = plan.at(8_000 - ANTICIPATE_MS + TRANSITION_MS / 2).scrollY;
    expect(settled).toBeGreaterThan(before);
    expect(during).toBeGreaterThan(before);
    expect(during).toBeLessThan(settled);
    // The first two systems fit in the first window, so there is no scroll for them.
    expect(plan.at(0).scrollY).toBe(plan.at(1_800).scrollY);
    // And a system that still fits in the current window does not move it.
    expect(plan.at(6_100).scrollY).toBe(plan.at(5_000).scrollY);
  });

  it('follows repeats, because it follows the played order not the written one', () => {
    const repeated = buildFramePlan({ ...base, timeline: timelineOf([0, 1, 0, 1]) });
    expect(repeated.at(2_500).active?.id).toBe(0);
    expect(repeated.at(3_500).active?.id).toBe(1);
  });

  it('holds the first system and lights nothing during a lead-in, then offsets the music by it', () => {
    const counted = buildFramePlan({ ...base, timeline: timelineOf([0, 1]), leadInMs: 2_000 });
    expect(counted.durationMs).toBe(4_000);
    expect(counted.at(1_000).active).toBeNull();
    expect(counted.at(1_000).page).toBe(0);
    expect(counted.at(2_100).active?.id).toBe(0);
    expect(counted.at(3_100).active?.id).toBe(1);
  });

  it('portrait never scrolls, only turns pages', () => {
    const portrait = buildFramePlan({
      ...base,
      layout: 'portrait',
      frame: { width: 1080, height: 1920 },
      timeline: timelineOf(ids),
    });
    for (let t = 0; t < portrait.durationMs; t += 250) expect(portrait.at(t).scrollY).toBe(0);
    expect(portrait.at(11_000).page).toBe(1);
  });

  it('note mode lights the sounding note, and falls back to the measure where there is none', () => {
    const note = (id: number, x: number): Box => ({
      id,
      page: 0,
      x,
      y: 200,
      sx: 40,
      sy: 200,
      width: 40,
      height: 200,
    });
    const segments: Positions = {
      elements: [note(0, 120), note(1, 220)],
      events: [
        { elid: 0, position: 0 },
        { elid: 1, position: 500 },
      ],
      pageSize: PAGE,
    };
    const withNotes = buildFramePlan({
      ...base,
      highlight: 'note',
      segments,
      timeline: timelineOf([0, 1]),
    });
    expect(withNotes.at(100)).toMatchObject({ activeIsNote: true, active: { id: 0 } });
    expect(withNotes.at(700).active?.id).toBe(1);
    // After the last note event the last note stays lit; before any events exist it would be the measure.
    const noSegments = buildFramePlan({
      ...base,
      highlight: 'note',
      segments: null,
      timeline: timelineOf([0]),
    });
    expect(noSegments.at(100)).toMatchObject({ activeIsNote: false, active: { id: 0 } });
  });

  it('lights nothing after the end and before any timeline', () => {
    expect(plan.at(99_000).active).toBeNull();
    const empty = buildFramePlan({
      ...base,
      timeline: { schemaVersion: 1, durationMs: 0, renderDurationMs: 0, occurrences: [] },
    });
    expect(empty.frameCount).toBe(1);
    expect(empty.at(0)).toMatchObject({ page: 0, active: null, turn: null });
  });
});
