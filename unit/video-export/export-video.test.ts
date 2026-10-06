import { describe, expect, it, vi } from 'vitest';
import type { AudioBlock } from '../../lib/video-export/audioFeed';
import {
  ExportCancelled,
  exportVideo,
  frameKey,
  type PageProvider,
} from '../../lib/video-export/exportVideo';
import { buildFramePlan } from '../../lib/video-export/framePlan';
import type { VideoSink } from '../../lib/video-export/sink';
import type { PlaybackTimeline, Positions } from '../../lib/webmscore-loader';

const box = (id: number, page: number, y: number) => ({
  id,
  page,
  x: 100,
  y,
  sx: 400,
  sy: 200,
  width: 400,
  height: 200,
});
const measures: Positions = {
  elements: [box(0, 0, 200), box(1, 0, 700), box(2, 1, 200)],
  events: [],
  pageSize: { width: 2000, height: 3000 },
};
const timeline: PlaybackTimeline = {
  schemaVersion: 1,
  durationMs: 3000,
  renderDurationMs: 3000,
  occurrences: [0, 1, 2].map((measureIndex, i) => ({
    occurrenceIndex: i,
    measureIndex,
    startMs: i * 1000,
    endMs: (i + 1) * 1000,
  })),
};
const plan = buildFramePlan({
  timeline,
  measures,
  highlight: 'measure',
  layout: 'portrait',
  frame: { width: 1080, height: 1920 },
  fps: 10,
});

function fakes() {
  const events: string[] = [];
  const frames: { t: number; d: number }[] = [];
  const audioLog: { start: number; offset: number }[] = [];
  const sink: VideoSink = {
    addFrame: vi.fn(async (t, d) => {
      frames.push({ t, d });
      events.push('frame');
    }),
    addAudio: vi.fn(async (block, offset) => {
      audioLog.push({ start: block.startSeconds, offset });
      events.push('audio');
    }),
    finish: vi.fn(async () => new Blob(['x'])),
    cancel: vi.fn(async () => {}),
  };
  const order: string[] = [];
  const ready = new Set<number>();
  const log = { ensured: [] as number[], prefetched: [] as number[], released: [] as number[][] };
  const pages: PageProvider = {
    ensure: vi.fn(async (p) => {
      log.ensured.push(p);
      order.push(`ensure:${p}`);
      ready.add(p);
    }),
    prefetch: vi.fn((p) => log.prefetched.push(p)),
    release: vi.fn((keep) => log.released.push([...keep])),
  };
  const drawn: number[] = [];
  const compositor = {
    draw: vi.fn((state: { page: number }) => {
      drawn.push(state.page);
      order.push(`draw:${state.page}`);
    }),
  };
  return { sink, pages, compositor, events, frames, audioLog, log, drawn, order };
}

async function* blocks(count: number, seconds = 1): AsyncGenerator<AudioBlock> {
  for (let i = 0; i < count; i += 1) {
    yield {
      channels: [new Float32Array(512)],
      sampleRate: 512,
      startSeconds: i * seconds,
      frames: 512 * seconds,
    };
  }
}

describe('frameKey', () => {
  const base = { page: 0, scrollY: 0, turn: null, active: box(0, 0, 200), activeIsNote: false };
  it('is equal for identical pictures and differs when anything visible changes', () => {
    expect(frameKey({ ...base })).toBe(frameKey({ ...base, active: { ...box(0, 0, 200) } }));
    expect(frameKey({ ...base, active: box(1, 0, 700) })).not.toBe(frameKey(base));
    expect(frameKey({ ...base, scrollY: 12 })).not.toBe(frameKey(base));
    expect(frameKey({ ...base, page: 1 })).not.toBe(frameKey(base));
    expect(frameKey({ ...base, activeIsNote: true })).not.toBe(frameKey(base));
    expect(frameKey({ ...base, active: null })).not.toBe(frameKey(base));
    const turning = { fromPage: 0, fromScrollY: 0, progress: 0.2 };
    expect(frameKey({ ...base, turn: turning })).not.toBe(frameKey(base));
    expect(frameKey({ ...base, turn: { ...turning, progress: 0.4 } })).not.toBe(
      frameKey({ ...base, turn: turning }),
    );
  });
});

describe('exportVideo', () => {
  it('repaints only when the picture changes, but still sends every frame, flagging the repeats', async () => {
    const f = fakes();
    const flags: (boolean | undefined)[] = [];
    f.sink.addFrame = vi.fn(async (_t, _d, unchanged) => {
      flags.push(unchanged);
    });
    await exportVideo({ plan, ...f });
    expect(flags).toHaveLength(30);
    expect(flags[0]).toBe(false);
    expect(f.compositor.draw.mock.calls.length).toBe(flags.filter((x) => !x).length);
    expect(f.compositor.draw.mock.calls.length).toBeLessThan(15);
    expect(flags.filter(Boolean).length).toBeGreaterThan(15);
  });

  it('encodes ceil(duration * fps) frames at i / fps with one-frame durations, then finishes', async () => {
    const f = fakes();
    const result = await exportVideo({ plan, ...f });
    expect(f.frames).toHaveLength(30);
    expect(f.frames[0]).toEqual({ t: 0, d: 0.1 });
    expect(f.frames[29].t).toBeCloseTo(2.9);
    expect(f.frames.map((x) => x.t)).toEqual([...f.frames.map((x) => x.t)].sort((a, b) => a - b));
    expect(f.sink.finish).toHaveBeenCalledTimes(1);
    expect(result).toBeInstanceOf(Blob);
  });

  it('makes each page ready before drawing it, and prefetches the next page', async () => {
    const f = fakes();
    await exportVideo({ plan, ...f });
    expect(f.log.ensured[0]).toBe(0);
    expect(f.log.prefetched).toContain(1);
    // Page 1 is made ready before the first frame that shows it.
    expect(f.order.indexOf('draw:1')).toBeGreaterThan(f.order.indexOf('ensure:1'));
    expect(f.order.indexOf('ensure:1')).toBeGreaterThan(-1);
    expect(f.log.released.at(-1)).not.toContain(0);
  });

  it('feeds audio alongside the frames, not all before or after, and adds the lead-in', async () => {
    const f = fakes();
    await exportVideo({ plan, ...f, audio: blocks(3), leadInSeconds: 0.5 });
    expect(f.audioLog.map((a) => a.start)).toEqual([0, 1, 2]);
    expect(f.audioLog.every((a) => a.offset === 0.5)).toBe(true);
    const firstFrame = f.events.indexOf('frame');
    const firstAudio = f.events.indexOf('audio');
    const lastFrame = f.events.lastIndexOf('frame');
    const lastAudio = f.events.lastIndexOf('audio');
    expect(firstAudio).toBeGreaterThan(firstFrame);
    expect(lastAudio).toBeGreaterThan(lastFrame - 20);
    expect(f.events.slice(0, lastFrame).includes('audio')).toBe(true);
  });

  it('drains audio that is longer than the picture', async () => {
    const f = fakes();
    await exportVideo({ plan, ...f, audio: blocks(6) });
    expect(f.audioLog).toHaveLength(6);
  });

  it('reports progress every ten frames and at the end', async () => {
    const f = fakes();
    const onProgress = vi.fn();
    await exportVideo({ plan, ...f, onProgress });
    expect(onProgress.mock.calls.map((c) => c[0].framesDone)).toEqual([10, 20, 30]);
    expect(onProgress).toHaveBeenLastCalledWith({ framesDone: 30, frameCount: 30 });
  });

  it('cancels mid-way: stops encoding, abandons the file, stops the audio', async () => {
    const f = fakes();
    const controller = new AbortController();
    f.sink.addFrame = vi.fn(async (t) => {
      f.frames.push({ t, d: 0 });
      if (f.frames.length === 5) controller.abort();
    });
    const audio = blocks(3);
    const returned = vi.spyOn(audio, 'return');
    await expect(
      exportVideo({ plan, ...f, audio, signal: controller.signal }),
    ).rejects.toBeInstanceOf(ExportCancelled);
    expect(f.frames).toHaveLength(5);
    expect(f.sink.cancel).toHaveBeenCalledTimes(1);
    expect(f.sink.finish).not.toHaveBeenCalled();
    expect(returned).toHaveBeenCalled();
  });

  it('abandons the file on an encoder failure and rethrows it', async () => {
    const f = fakes();
    f.sink.addFrame = vi.fn(async () => {
      throw new Error('encoder died');
    });
    await expect(exportVideo({ plan, ...f })).rejects.toThrow('encoder died');
    expect(f.sink.cancel).toHaveBeenCalled();
    expect(f.sink.finish).not.toHaveBeenCalled();
  });

  it('does nothing at all when aborted before it starts', async () => {
    const f = fakes();
    const controller = new AbortController();
    controller.abort();
    await expect(exportVideo({ plan, ...f, signal: controller.signal })).rejects.toBeInstanceOf(
      ExportCancelled,
    );
    expect(f.frames).toHaveLength(0);
  });
});
