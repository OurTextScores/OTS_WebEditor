import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SynthAudioBatchIterator } from '@/lib/webmscore-loader';
import {
  cancelSynthStream,
  scheduleSynthBatchStream,
  stopSynthStream,
} from '@/lib/playback/stream-scheduler';
import {
  BLOCK_FRAMES,
  BLOCK_SECONDS,
  block,
  fakeAudioContext,
  ref,
  SAMPLE_RATE,
  scriptedIterator,
} from './helpers/fake-audio';

/**
 * The stream scheduler against a fake audio clock: timing, startup buffering, merging, the render window as the clock
 * moves, cancellation and seeking. (`stream-scheduler.test.ts` holds the first set of single-call checks.)
 */
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

const target = () => ({
  sourcesRef: ref<AudioBufferSourceNode[]>([]),
  iteratorRef: ref<SynthAudioBatchIterator | null>(null),
  generationRef: ref(0),
});

describe('where audio lands on the clock', () => {
  it('starts each block at the anchor plus its offset from the first block, whatever the first block’s score time', async () => {
    const audio = fakeAudioContext(5);
    const iterator = scriptedIterator([
      [block(30), block(30 + BLOCK_SECONDS), block(30 + 2 * BLOCK_SECONDS, { done: true })],
    ]);
    const onClockAnchor = vi.fn();
    await scheduleSynthBatchStream(iterator, audio.context, {
      ...target(),
      debugLabel: 'seeked',
      prerollSeconds: 0.1,
      onClockAnchor,
    });
    expect(onClockAnchor).toHaveBeenCalledWith({ contextTime: 5.1, scoreTimeSeconds: 30 });
    expect(audio.sources.map((source) => source.startedAt)).toEqual([
      5.1,
      expect.closeTo(5.1 + BLOCK_SECONDS, 9),
      expect.closeTo(5.1 + 2 * BLOCK_SECONDS, 9),
    ]);
  });

  it('anchors once, on the first scheduled block, never again', async () => {
    const audio = fakeAudioContext();
    const onClockAnchor = vi.fn();
    const iterator = scriptedIterator([
      [block(0)],
      [block(BLOCK_SECONDS)],
      [block(2 * BLOCK_SECONDS, { done: true })],
    ]);
    await scheduleSynthBatchStream(iterator, audio.context, {
      ...target(),
      debugLabel: 'a',
      onClockAnchor,
    });
    expect(onClockAnchor).toHaveBeenCalledTimes(1);
  });

  it('connects every source to the given destination, else to the context’s own', async () => {
    const own = fakeAudioContext();
    await scheduleSynthBatchStream(scriptedIterator([[block(0, { done: true })]]), own.context, {
      ...target(),
      debugLabel: 'a',
    });
    expect(own.sources[0].connectedTo).toBe(own.destination);

    const gain = { name: 'gain' } as unknown as AudioNode;
    const routed = fakeAudioContext();
    await scheduleSynthBatchStream(scriptedIterator([[block(0, { done: true })]]), routed.context, {
      ...target(),
      debugLabel: 'b',
      destination: gain,
    });
    expect(routed.sources[0].connectedTo).toBe(gain);
  });
});

describe('turning engine blocks into audio buffers', () => {
  it('reads a stereo block as two channels and a mono block as one, keeping the samples', async () => {
    const audio = fakeAudioContext();
    const stereo = block(0, { fill: 0.5 });
    const mono = block(BLOCK_SECONDS, { channels: 1, fill: -0.25, done: true });
    await scheduleSynthBatchStream(scriptedIterator([[stereo, mono]]), audio.context, {
      ...target(),
      debugLabel: 'a',
    });
    expect(audio.buffers.map((buffer) => buffer.channels)).toEqual([2, 1]);
    expect(audio.buffers[0].frames).toBe(BLOCK_FRAMES);
    expect(audio.buffers[0].data[0][0]).toBe(0.5);
    expect(audio.buffers[0].data[1][BLOCK_FRAMES - 1]).toBe(0.5);
    expect(audio.buffers[1].data[0][100]).toBe(-0.25);
  });

  it('uses at most two channels, even if the engine returns more', async () => {
    const audio = fakeAudioContext();
    await scheduleSynthBatchStream(
      scriptedIterator([[block(0, { channels: 4, done: true })]]),
      audio.context,
      { ...target(), debugLabel: 'wide' },
    );
    expect(audio.buffers[0].channels).toBe(2);
  });

  it('merges contiguous blocks into one buffer up to the merge window, and starts a new one after that', async () => {
    const audio = fakeAudioContext();
    // 4 blocks of 512 frames; a window of 1,024 frames merges them in pairs.
    const blocks = [0, 1, 2, 3].map((index) => block(index * BLOCK_SECONDS, { done: index === 3 }));
    await scheduleSynthBatchStream(scriptedIterator([blocks]), audio.context, {
      ...target(),
      debugLabel: 'merge',
      prerollSeconds: 0,
      mergeWindowSeconds: (2 * BLOCK_FRAMES) / SAMPLE_RATE,
    });
    expect(audio.buffers.map((buffer) => buffer.frames)).toEqual([1024, 512, 512]);
    expect(audio.sources.map((source) => source.startedAt)).toEqual([
      0,
      expect.closeTo(2 * BLOCK_SECONDS, 9),
      expect.closeTo(3 * BLOCK_SECONDS, 9),
    ]);
  });

  it('does not merge across a gap, and never merges the block marked done', async () => {
    const audio = fakeAudioContext();
    const blocks = [
      block(0),
      block(BLOCK_SECONDS * 3),
      block(BLOCK_SECONDS * 4),
      block(BLOCK_SECONDS * 5, { done: true }),
    ];
    await scheduleSynthBatchStream(scriptedIterator([blocks]), audio.context, {
      ...target(),
      debugLabel: 'gap',
      prerollSeconds: 0,
      mergeWindowSeconds: 1,
    });
    expect(audio.buffers.map((buffer) => buffer.frames)).toEqual([512, 1024, 512]);
    expect(audio.sources[1].startedAt).toBeCloseTo(BLOCK_SECONDS * 3, 9);
    expect(audio.sources[2].startedAt).toBeCloseTo(BLOCK_SECONDS * 5, 9);
  });

  it('ignores what comes after a block marked done, in the same batch and in the next', async () => {
    const audio = fakeAudioContext();
    const iterator = scriptedIterator([
      [block(0), block(BLOCK_SECONDS, { done: true }), block(2 * BLOCK_SECONDS)],
      [block(3 * BLOCK_SECONDS)],
    ]);
    await scheduleSynthBatchStream(iterator, audio.context, { ...target(), debugLabel: 'done' });
    expect(audio.sources).toHaveLength(2);
    expect(iterator.state.pulls).toBe(1);
  });

  it('stops at the maximum duration even if the engine would go on', async () => {
    const audio = fakeAudioContext();
    const iterator = scriptedIterator([
      [block(0, { seconds: 1 })],
      [block(1, { seconds: 1 })],
      [block(2, { seconds: 1 })],
      [block(3, { seconds: 1 })],
    ]);
    await scheduleSynthBatchStream(iterator, audio.context, {
      ...target(),
      debugLabel: 'cap',
      maxDurationSeconds: 2,
    });
    expect(iterator.state.pulls).toBe(2);
    expect(audio.sources).toHaveLength(2);
  });
});

describe('starting up', () => {
  it('holds blocks back until the minimum number of batches has arrived, then schedules them all from one anchor', async () => {
    const audio = fakeAudioContext(1);
    const iterator = scriptedIterator([
      [block(0)],
      [block(BLOCK_SECONDS)],
      [block(2 * BLOCK_SECONDS)],
      [block(3 * BLOCK_SECONDS, { done: true })],
    ]);
    const onClockAnchor = vi.fn();
    const run = scheduleSynthBatchStream(iterator, audio.context, {
      ...target(),
      debugLabel: 'startup',
      prerollSeconds: 0,
      minStartupBatches: 3,
      onClockAnchor,
    });
    await vi.advanceTimersByTimeAsync(0);
    await run;
    // Batches 1 and 2 were held; the third released everything together, so the later blocks keep their offsets.
    expect(onClockAnchor).toHaveBeenCalledTimes(1);
    expect(audio.sources.map((source) => source.startedAt)).toEqual([
      1,
      expect.closeTo(1 + BLOCK_SECONDS, 9),
      expect.closeTo(1 + 2 * BLOCK_SECONDS, 9),
      expect.closeTo(1 + 3 * BLOCK_SECONDS, 9),
    ]);
  });

  it('anchors the clock when the held blocks are released, not when the first one arrived', async () => {
    const audio = fakeAudioContext(0);
    const iterator = scriptedIterator(
      [[block(0)], [block(BLOCK_SECONDS)], [block(2 * BLOCK_SECONDS, { done: true })]],
      () => {
        // The engine takes a second to render each batch.
        void audio.advance(1);
      },
    );
    const onClockAnchor = vi.fn();
    const run = scheduleSynthBatchStream(iterator, audio.context, {
      ...target(),
      debugLabel: 'release',
      prerollSeconds: 0,
      minStartupBatches: 3,
      onClockAnchor,
    });
    await vi.advanceTimersByTimeAsync(5_000);
    await run;
    expect(onClockAnchor).toHaveBeenCalledTimes(1);
    // Three pulls, a second each: nothing is anchored before the third.
    expect(onClockAnchor.mock.calls[0][0].contextTime).toBe(3);
    expect(audio.sources[0].startedAt).toBe(3);
  });

  it('holds blocks until enough audio is buffered, then plays from the first one', async () => {
    const audio = fakeAudioContext();
    const iterator = scriptedIterator([
      [block(0, { seconds: 0.4 })],
      [block(0.4, { seconds: 0.4 })],
      [block(0.8, { seconds: 0.4, done: true })],
    ]);
    const pullsWhenPlaying: number[] = [];
    await scheduleSynthBatchStream(iterator, audio.context, {
      ...target(),
      debugLabel: 'buffer',
      prerollSeconds: 0,
      startupBufferSeconds: 0.7,
      onPlayingChange: (playing) => playing && pullsWhenPlaying.push(iterator.state.pulls),
    });
    // 0.4 s is not enough; with the second batch 0.8 s are buffered and the held first block goes out with it.
    expect(pullsWhenPlaying).toEqual([2]);
    expect(audio.sources[0].startedAt).toBe(0);
  });

  it('starts whatever it has when the stream ends before the startup threshold', async () => {
    const audio = fakeAudioContext();
    await scheduleSynthBatchStream(scriptedIterator([[block(0, { done: true })]]), audio.context, {
      ...target(),
      debugLabel: 'short',
      minStartupBatches: 5,
      startupBufferSeconds: 10,
    });
    expect(audio.sources).toHaveLength(1);
  });

  it('never plays when the engine has nothing', async () => {
    const audio = fakeAudioContext();
    const t = target();
    const iterator = scriptedIterator([]);
    const onPlayingChange = vi.fn();
    await scheduleSynthBatchStream(iterator, audio.context, {
      ...t,
      debugLabel: 'empty',
      onPlayingChange,
    });
    expect(audio.sources).toEqual([]);
    expect(onPlayingChange).toHaveBeenCalledOnce();
    expect(onPlayingChange).toHaveBeenCalledWith(false);
    expect(t.iteratorRef.current).toBeNull();
  });
});

describe('the render window as the clock moves', () => {
  it('keeps rendering while it is inside the horizon, pauses once past it, and resumes at low water', async () => {
    const audio = fakeAudioContext();
    // Each batch is 12 s of audio: after two, 24 s are scheduled (past the 20 s horizon).
    const batches = Array.from({ length: 6 }, (_, i) => [block(i * 12, { seconds: 12 })]);
    batches[5] = [block(60, { seconds: 12, done: true })];
    const iterator = scriptedIterator(batches);
    const onIdle = vi.fn();
    const run = scheduleSynthBatchStream(iterator, audio.context, {
      ...target(),
      debugLabel: 'window',
      prerollSeconds: 0,
      renderWindow: { horizonSeconds: 20, lowWaterSeconds: 10 },
      onRenderWindowIdleChange: onIdle,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(iterator.state.pulls).toBe(2);
    expect(onIdle).toHaveBeenLastCalledWith(true);

    // 24 s buffered, low water 10 s: it waits until the playhead is 14 s in.
    await audio.advance(13);
    expect(iterator.state.pulls).toBe(2);
    await audio.advance(1.5);
    expect(iterator.state.pulls).toBeGreaterThanOrEqual(3);
    expect(onIdle).toHaveBeenCalledWith(false);

    // Keep playing: scheduled audio never runs further ahead of the playhead than the horizon plus one batch.
    const scheduledUntil = () =>
      Math.max(
        ...audio.sources.map(
          (source) => (source.startedAt ?? 0) + (source.buffer?.frames ?? 0) / SAMPLE_RATE,
        ),
      );
    for (let step = 0; step < 6; step += 1) {
      await audio.advance(10);
      expect(scheduledUntil() - audio.now).toBeLessThanOrEqual(20 + 12);
    }
    await audio.advance(60);
    await run;
    expect(iterator.state.pulls).toBe(6);
  });

  it('does not throttle a stream with no window (a short one-shot clip)', async () => {
    const audio = fakeAudioContext();
    const iterator = scriptedIterator([
      [block(0, { seconds: 100 })],
      [block(100, { seconds: 100 })],
      [block(200, { seconds: 100, done: true })],
    ]);
    await scheduleSynthBatchStream(iterator, audio.context, {
      ...target(),
      debugLabel: 'clip',
      renderWindow: null,
    });
    expect(iterator.state.pulls).toBe(3);
  });

  it('stops waiting, and schedules nothing more, when the stream is cancelled during an idle wait', async () => {
    const audio = fakeAudioContext();
    const t = target();
    const iterator = scriptedIterator([
      [block(0, { seconds: 30 })],
      [block(30, { seconds: 30, done: true })],
    ]);
    const run = scheduleSynthBatchStream(iterator, audio.context, {
      ...t,
      debugLabel: 'cancel-idle',
      prerollSeconds: 0,
      renderWindow: { horizonSeconds: 20, lowWaterSeconds: 10 },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(iterator.state.pulls).toBe(1);
    await cancelSynthStream(t, { awaitCancel: true });
    await audio.advance(60);
    await run;
    expect(iterator.state.pulls).toBe(1);
    expect(audio.sources.every((source) => source.stopped)).toBe(true);
    expect(iterator.state.cancelled).toBe(true);
  });
});

describe('a late result from a cancelled run', () => {
  it('schedules nothing, even when the engine finally returns audio', async () => {
    const audio = fakeAudioContext();
    const t = target();
    let deliver!: (chunks: ReturnType<typeof block>[]) => void;
    const iterator = vi.fn(async (cancel?: boolean) => {
      if (cancel) return [];
      return new Promise<ReturnType<typeof block>[]>((resolve) => {
        deliver = resolve;
      });
    }) as unknown as SynthAudioBatchIterator;
    const onClockAnchor = vi.fn();
    const onPlayingChange = vi.fn();
    const run = scheduleSynthBatchStream(iterator, audio.context, {
      ...t,
      debugLabel: 'late',
      onClockAnchor,
      onPlayingChange,
    });
    await vi.advanceTimersByTimeAsync(0);
    await cancelSynthStream(t, { awaitCancel: true });
    deliver([block(0), block(BLOCK_SECONDS, { done: true })]);
    await run;
    expect(audio.sources).toEqual([]);
    expect(onClockAnchor).not.toHaveBeenCalled();
    expect(onPlayingChange).not.toHaveBeenCalled();
  });
});

describe('releasing and ending', () => {
  it('keeps the live sources near the window size over a long stream as played sources finish', async () => {
    const audio = fakeAudioContext();
    const t = target();
    // 100 batches of 1 s each.
    const batches = Array.from({ length: 100 }, (_, i) => [
      block(i, { seconds: 1, done: i === 99 }),
    ]);
    const iterator = scriptedIterator(batches);
    let peak = 0;
    const run = scheduleSynthBatchStream(iterator, audio.context, {
      ...t,
      debugLabel: 'long',
      prerollSeconds: 0,
      renderWindow: { horizonSeconds: 5, lowWaterSeconds: 3 },
    });
    for (let second = 0; second < 110; second += 1) {
      await audio.advance(1);
      audio.finishPlayedSources();
      peak = Math.max(peak, t.sourcesRef.current.length);
    }
    await run;
    expect(peak).toBeLessThanOrEqual(8);
    expect(iterator.state.pulls).toBe(100);
  });

  it('reports the end only after the last source has played, and then clears its ownership', async () => {
    const audio = fakeAudioContext();
    const t = target();
    const onEnded = vi.fn();
    const onPlayingChange = vi.fn();
    const iterator = scriptedIterator([[block(0), block(BLOCK_SECONDS, { done: true })]]);
    await scheduleSynthBatchStream(iterator, audio.context, {
      ...t,
      debugLabel: 'end',
      onEnded,
      onPlayingChange,
    });
    expect(onPlayingChange).toHaveBeenCalledOnce();
    expect(onEnded).not.toHaveBeenCalled();
    audio.sources[0].finish();
    expect(onEnded).not.toHaveBeenCalled();
    audio.sources[1].finish();
    expect(onEnded).toHaveBeenCalledOnce();
    expect(onPlayingChange).toHaveBeenLastCalledWith(false);
    expect(t.sourcesRef.current).toEqual([]);
    expect(t.iteratorRef.current).toBeNull();
  });

  it('does not report an end for a stream that was cancelled before its last source finished', async () => {
    const audio = fakeAudioContext();
    const t = target();
    const onEnded = vi.fn();
    const iterator = scriptedIterator([[block(0, { done: true })]]);
    await scheduleSynthBatchStream(iterator, audio.context, { ...t, debugLabel: 'late', onEnded });
    await cancelSynthStream(t, { awaitCancel: true });
    audio.sources[0].finish();
    expect(onEnded).not.toHaveBeenCalled();
  });
});

describe('stopping and seeking', () => {
  it('stops and disconnects every scheduled source and cancels the iterator', async () => {
    const audio = fakeAudioContext();
    const t = target();
    const iterator = scriptedIterator([
      [block(0), block(BLOCK_SECONDS), block(2 * BLOCK_SECONDS)],
      [block(3 * BLOCK_SECONDS, { done: true })],
    ]);
    const run = scheduleSynthBatchStream(iterator, audio.context, {
      ...t,
      debugLabel: 'stop',
      renderWindow: { horizonSeconds: 0.001, lowWaterSeconds: 0 },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.sourcesRef.current.length).toBeGreaterThan(0);
    await stopSynthStream(t.sourcesRef, t.iteratorRef, { awaitCancel: true });
    expect(audio.sources.every((source) => source.stopped && source.disconnected)).toBe(true);
    expect(t.sourcesRef.current).toEqual([]);
    expect(iterator.state.cancelled).toBe(true);
    t.generationRef.current += 1;
    await vi.advanceTimersByTimeAsync(5_000);
    await run;
  });

  it('a seek (cancel, then a new stream) anchors the new clock at the new score time and leaves nothing of the old one playing', async () => {
    const audio = fakeAudioContext(2);
    const t = target();
    const first = scriptedIterator([
      [block(0, { seconds: 30 })],
      [block(30, { seconds: 30, done: true })],
    ]);
    const firstRun = scheduleSynthBatchStream(first, audio.context, {
      ...t,
      debugLabel: 'first',
      prerollSeconds: 0,
      renderWindow: { horizonSeconds: 20, lowWaterSeconds: 10 },
    });
    await vi.advanceTimersByTimeAsync(0);
    const oldSources = [...audio.sources];

    await audio.advance(3);
    await cancelSynthStream(t, { awaitCancel: true });
    // The cancelled run is waiting out an idle timer; let it see the cancellation.
    await vi.advanceTimersByTimeAsync(2_000);
    const onClockAnchor = vi.fn();
    const second = scriptedIterator([[block(90, { seconds: 1, done: true })]]);
    await scheduleSynthBatchStream(second, audio.context, {
      ...t,
      debugLabel: 'second',
      prerollSeconds: 0.02,
      onClockAnchor,
    });
    await firstRun;

    expect(oldSources.every((source) => source.stopped)).toBe(true);
    expect(first.state.pulls).toBe(1);
    expect(onClockAnchor).toHaveBeenCalledWith({ contextTime: 5.02, scoreTimeSeconds: 90 });
    expect(t.iteratorRef.current).toBe(second);
    expect(t.sourcesRef.current).toHaveLength(1);
  });

  it('survives sources that throw when stopped or disconnected', async () => {
    const throwing = {
      stop: () => {
        throw new Error('already stopped');
      },
      disconnect: () => {
        throw new Error('already disconnected');
      },
    } as unknown as AudioBufferSourceNode;
    const sourcesRef = ref([throwing]);
    const iteratorRef = ref<SynthAudioBatchIterator | null>(null);
    await expect(stopSynthStream(sourcesRef, iteratorRef)).resolves.toBeUndefined();
    expect(sourcesRef.current).toEqual([]);
  });

  it('survives an iterator whose cancel rejects', async () => {
    const iterator = vi.fn(async (cancel?: boolean) => {
      if (cancel) throw new Error('worker gone');
      return [];
    }) as unknown as SynthAudioBatchIterator;
    const sourcesRef = ref<AudioBufferSourceNode[]>([]);
    const iteratorRef = ref<SynthAudioBatchIterator | null>(iterator);
    await expect(
      stopSynthStream(sourcesRef, iteratorRef, { awaitCancel: true }),
    ).resolves.toBeUndefined();
    expect(iteratorRef.current).toBeNull();
  });
});

describe('a failing engine', () => {
  it('rejects when a pull fails, with the sources already scheduled left for the caller to stop', async () => {
    const audio = fakeAudioContext();
    const t = target();
    let pull = 0;
    const iterator = vi.fn(async (cancel?: boolean) => {
      if (cancel) return [];
      pull += 1;
      if (pull === 2) throw new Error('worker crashed');
      return [block(0)];
    }) as unknown as SynthAudioBatchIterator;
    await expect(
      scheduleSynthBatchStream(iterator, audio.context, {
        ...t,
        debugLabel: 'crash',
        prerollSeconds: 0,
      }),
    ).rejects.toThrow('worker crashed');
    expect(t.sourcesRef.current).toHaveLength(1);
    await stopSynthStream(t.sourcesRef, t.iteratorRef);
    expect(audio.sources[0].stopped).toBe(true);
  });
});
