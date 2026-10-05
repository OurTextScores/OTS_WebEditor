import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClickScheduler,
  clicksFromTimeline,
  countInClicks,
  countInSeconds,
  planClicks,
} from '@/lib/playback/click-track';
import type { PlaybackTimeline, PlaybackTimelineOccurrence } from '@/lib/webmscore-loader';
import { fakeAudioContext } from './helpers/fake-audio';

const occurrence = (
  index: number,
  startMs: number,
  endMs: number,
  extra: Partial<PlaybackTimelineOccurrence> = {},
): PlaybackTimelineOccurrence => ({
  occurrenceIndex: index,
  measureIndex: index,
  startMs,
  endMs,
  ...extra,
});
const timeline = (occurrences: PlaybackTimelineOccurrence[]): PlaybackTimeline => ({
  schemaVersion: 1,
  durationMs: occurrences.at(-1)?.endMs ?? 0,
  renderDurationMs: 0,
  occurrences,
});

/** Two bars of 4/4 at 120 bpm, then one bar of 6/8 at 120 dotted-quarter bpm... as the engine reports them. */
const SONG = timeline([
  occurrence(0, 0, 2000, { beatsMs: [0, 500, 1000, 1500], downbeat: true, beatsPerMeasure: 4 }),
  occurrence(1, 2000, 4000, {
    beatsMs: [2000, 2500, 3000, 3500],
    downbeat: true,
    beatsPerMeasure: 4,
  }),
  occurrence(2, 4000, 5500, { beatsMs: [4000, 4750], downbeat: true, beatsPerMeasure: 2 }),
]);

describe('clicksFromTimeline', () => {
  it('lists every beat in order, accenting the first of each measure', () => {
    const clicks = clicksFromTimeline(SONG);
    expect(clicks.map((click) => click.timeMs)).toEqual([
      0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4750,
    ]);
    expect(clicks.filter((click) => click.accent).map((click) => click.timeMs)).toEqual([
      0, 2000, 4000,
    ]);
  });

  it('does not accent the first beat of an occurrence that starts mid-measure (after a jump, into a volta)', () => {
    const clicks = clicksFromTimeline(
      timeline([
        occurrence(0, 0, 1000, { beatsMs: [0, 500], downbeat: false, beatsPerMeasure: 4 }),
      ]),
    );
    expect(clicks.some((click) => click.accent)).toBe(false);
  });

  it('puts a repeated measure’s beats in played order, not written order', () => {
    const clicks = clicksFromTimeline(
      timeline([
        occurrence(0, 3000, 4000, { beatsMs: [3000, 3500], downbeat: true }),
        occurrence(1, 0, 1000, { beatsMs: [0, 500], downbeat: true }),
      ]),
    );
    expect(clicks.map((click) => click.timeMs)).toEqual([0, 500, 3000, 3500]);
  });

  it('gives nothing for a timeline without beats (an older engine) or no timeline', () => {
    expect(clicksFromTimeline(timeline([occurrence(0, 0, 2000)]))).toEqual([]);
    expect(clicksFromTimeline(null)).toEqual([]);
  });
});

describe('countInClicks', () => {
  it('counts one measure at the tempo of the beat the music starts in, ending a beat before it', () => {
    const clicks = countInClicks(SONG, 0);
    expect(clicks.map((click) => click.timeMs)).toEqual([-2000, -1500, -1000, -500]);
    expect(clicks.map((click) => click.accent)).toEqual([true, false, false, false]);
    expect(countInSeconds(clicks, 0)).toBe(2);
  });

  it('uses the meter of the measure it starts in: two beats in 6/8', () => {
    const clicks = countInClicks(SONG, 4000);
    expect(clicks.map((click) => click.timeMs)).toEqual([4000 - 1500, 4000 - 750]);
  });

  it('counts a start in the middle of a measure at that beat’s spacing', () => {
    const clicks = countInClicks(SONG, 3000);
    expect(clicks).toHaveLength(4);
    expect(clicks[3].timeMs).toBe(3000 - 500);
  });

  it('counts a start on a one-beat pickup at the tempo of the bar after it', () => {
    const withPickup = timeline([
      occurrence(0, 0, 1000, { beatsMs: [0], downbeat: false, beatsPerMeasure: 4 }),
      occurrence(1, 1000, 5000, {
        beatsMs: [1000, 2000, 3000, 4000],
        downbeat: true,
        beatsPerMeasure: 4,
      }),
    ]);
    expect(countInClicks(withPickup, 0).map((click) => click.timeMs)).toEqual([
      -4000, -3000, -2000, -1000,
    ]);
  });

  it('counts at the new tempo after a tempo change', () => {
    const fast = timeline([
      occurrence(0, 0, 2000, { beatsMs: [0, 500, 1000, 1500], beatsPerMeasure: 4 }),
      occurrence(1, 2000, 3000, { beatsMs: [2000, 2250, 2500, 2750], beatsPerMeasure: 4 }),
    ]);
    expect(countInClicks(fast, 2000).map((click) => click.timeMs)).toEqual([
      1000, 1250, 1500, 1750,
    ]);
  });

  it('falls back to four beats of half a second when the engine gave no beats', () => {
    const clicks = countInClicks(null, 1000);
    expect(clicks.map((click) => click.timeMs)).toEqual([-1000, -500, 0, 500]);
    expect(countInClicks(timeline([occurrence(0, 0, 2000)]), 0)).toHaveLength(4);
  });

  it('ignores a nonsensical beat spacing', () => {
    const clicks = countInClicks(
      timeline([occurrence(0, 0, 2000, { beatsMs: [0, 0], beatsPerMeasure: 2 })]),
      0,
    );
    expect(clicks.map((click) => click.timeMs)).toEqual([-1000, -500]);
  });

  it('has no length for an empty count-in', () => {
    expect(countInSeconds([], 5000)).toBe(0);
  });
});

describe('ClickScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  const beats = (times: number[]) =>
    times.map((timeMs, index) => ({ timeMs, accent: index === 0 }));

  it('places each click at the anchor plus its score time, count-in included (negative score times)', () => {
    const audio = fakeAudioContext(10);
    const scheduler = new ClickScheduler(audio.context, { aheadSeconds: 100 });
    // The music starts at context time 12 (a two-second lead-in), at score time 0.
    scheduler.start({ contextTime: 12, scoreTimeSeconds: 0 }, beats([-2000, -1000, 0, 500]), -2000);
    expect(audio.sources.map((source) => source.startedAt)).toEqual([10, 11, 12, 12.5]);
    scheduler.stop();
  });

  it('shares the music’s offset when the music starts partway into the score', () => {
    const audio = fakeAudioContext(5);
    const scheduler = new ClickScheduler(audio.context, { aheadSeconds: 100 });
    scheduler.start(
      { contextTime: 5.015, scoreTimeSeconds: 30 },
      beats([29000, 30000, 30500, 31000]),
      30000,
    );
    expect(audio.sources.map((source) => source.startedAt)).toEqual([
      expect.closeTo(5.015, 9),
      expect.closeTo(5.515, 9),
      expect.closeTo(6.015, 9),
    ]);
  });

  it('schedules only what falls within the look-ahead, then more as the clock advances', async () => {
    const audio = fakeAudioContext(0);
    const scheduler = new ClickScheduler(audio.context, { aheadSeconds: 1.2, tickMs: 100 });
    scheduler.start(
      { contextTime: 0, scoreTimeSeconds: 0 },
      beats([0, 500, 1000, 1500, 2000, 2500]),
      0,
    );
    expect(audio.sources.map((source) => source.startedAt)).toEqual([0, 0.5, 1]);
    await audio.advance(1);
    expect(audio.sources.map((source) => source.startedAt)).toEqual([0, 0.5, 1, 1.5, 2]);
    await audio.advance(1);
    expect(audio.sources).toHaveLength(6);
    scheduler.stop();
  });

  it('drops a click already in the past instead of playing it late', () => {
    const audio = fakeAudioContext(3);
    const scheduler = new ClickScheduler(audio.context, { aheadSeconds: 100 });
    scheduler.start({ contextTime: 0, scoreTimeSeconds: 0 }, beats([0, 1000, 2000, 4000, 5000]), 0);
    expect(audio.sources.map((source) => source.startedAt)).toEqual([4, 5]);
  });

  it('skips clicks before where it was started from', () => {
    const audio = fakeAudioContext(0);
    const scheduler = new ClickScheduler(audio.context, { aheadSeconds: 100 });
    scheduler.start({ contextTime: 1, scoreTimeSeconds: 2 }, beats([0, 1000, 2000, 3000]), 2000);
    expect(audio.sources.map((source) => source.startedAt)).toEqual([1, 2]);
  });

  it('uses a higher, separate sound for the accent, and a gain at the requested level into the destination', () => {
    const audio = fakeAudioContext(0);
    const destination = { name: 'master' } as unknown as AudioNode;
    const scheduler = new ClickScheduler(audio.context, {
      aheadSeconds: 100,
      destination,
      level: 0.3,
    });
    scheduler.start(
      { contextTime: 0, scoreTimeSeconds: 0 },
      [
        { timeMs: 0, accent: true },
        { timeMs: 500, accent: false },
        { timeMs: 1000, accent: false },
      ],
      0,
    );
    expect(audio.sources[0].buffer).not.toBe(audio.sources[1].buffer);
    expect(audio.sources[1].buffer).toBe(audio.sources[2].buffer);
    expect(audio.gains).toHaveLength(1);
    expect(audio.gains[0].gain.value).toBe(0.3);
    expect(audio.gains[0].connectedTo).toBe(destination);
    scheduler.setLevel(0.8);
    expect(audio.gains[0].gain.value).toBe(0.8);
    expect(audio.sources.every((source) => source.connectedTo === audio.gains[0])).toBe(true);
  });

  it('creates its sounds and gain once, however many times it restarts', () => {
    const audio = fakeAudioContext(0);
    const scheduler = new ClickScheduler(audio.context, { aheadSeconds: 100 });
    for (let run = 0; run < 3; run += 1) {
      scheduler.start({ contextTime: 0, scoreTimeSeconds: 0 }, beats([0, 500]), 0);
    }
    expect(audio.buffers).toHaveLength(2);
    expect(audio.gains).toHaveLength(1);
  });

  it('cancels every scheduled click and its timer on stop, and a restart begins clean', async () => {
    const audio = fakeAudioContext(0);
    const scheduler = new ClickScheduler(audio.context, { aheadSeconds: 1 });
    scheduler.start(
      { contextTime: 0, scoreTimeSeconds: 0 },
      beats([0, 500, 1000, 1500, 2000, 2500]),
      0,
    );
    expect(scheduler.running).toBe(true);
    const first = [...audio.sources];
    scheduler.stop();
    expect(scheduler.running).toBe(false);
    expect(first.every((source) => source.stopped && source.disconnected)).toBe(true);
    await audio.advance(5);
    expect(audio.sources).toHaveLength(first.length);

    scheduler.start({ contextTime: 5, scoreTimeSeconds: 1 }, beats([1000, 1500]), 1000);
    expect(audio.sources.slice(first.length).map((source) => source.startedAt)).toEqual([5, 5.5]);
  });

  it('releases a click when it has played, and stops its timer once every click is scheduled', async () => {
    const audio = fakeAudioContext(0);
    const scheduler = new ClickScheduler(audio.context, { aheadSeconds: 100 });
    scheduler.start({ contextTime: 0, scoreTimeSeconds: 0 }, beats([0, 500]), 0);
    audio.sources[0].finish();
    expect(audio.sources[0].disconnected).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    scheduler.stop();
  });

  it('does nothing for an empty click list, and survives sources that throw on stop', () => {
    const audio = fakeAudioContext(0);
    const scheduler = new ClickScheduler(audio.context);
    scheduler.start({ contextTime: 0, scoreTimeSeconds: 0 }, [], 0);
    expect(audio.sources).toEqual([]);
    scheduler.start({ contextTime: 0, scoreTimeSeconds: 0 }, beats([0]), 0);
    audio.sources[0].stop = () => {
      throw new Error('already stopped');
    };
    audio.sources[0].disconnect = () => {
      throw new Error('already disconnected');
    };
    expect(() => scheduler.stop()).not.toThrow();
  });
});

describe('planClicks', () => {
  it('is nothing when the metronome is off, or the engine gave no beats', () => {
    expect(planClicks(SONG, 0, { enabled: false, countIn: true })).toBeNull();
    expect(
      planClicks(timeline([occurrence(0, 0, 2000)]), 0, { enabled: true, countIn: false }),
    ).toBeNull();
    expect(planClicks(null, 0, { enabled: true, countIn: true })).toBeNull();
  });

  it('plays the beats from the start on, with no lead-in, when there is no count-in', () => {
    const plan = planClicks(SONG, 3000, { enabled: true, countIn: false })!;
    expect(plan.clicks.map((click) => click.timeMs)).toEqual([3000, 3500, 4000, 4750]);
    expect(plan.fromMs).toBe(3000);
    expect(plan.leadInSeconds).toBe(0);
  });

  it('puts a count-in first and delays the music by it', () => {
    const plan = planClicks(SONG, 2000, { enabled: true, countIn: true })!;
    expect(plan.clicks.slice(0, 4).map((click) => click.timeMs)).toEqual([0, 500, 1000, 1500]);
    expect(plan.clicks.slice(4, 6).map((click) => click.timeMs)).toEqual([2000, 2500]);
    expect(plan.fromMs).toBe(0);
    expect(plan.leadInSeconds).toBe(2);
    // In order, so the scheduler can walk it.
    expect(plan.clicks.map((click) => click.timeMs)).toEqual(
      [...plan.clicks.map((click) => click.timeMs)].sort((a, b) => a - b),
    );
  });
});
