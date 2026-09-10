import { describe, expect, it, vi } from 'vitest';
import type { MutableRefObject } from 'react';
import type { SynthAudioBatchIterator } from '@/lib/webmscore-loader';
import {
  cancelSynthStream,
  scheduleSynthBatchStream,
  stopSynthStream,
} from '@/lib/playback/stream-scheduler';

const ref = <T>(current: T) => ({ current }) as MutableRefObject<T>;

describe('stream scheduler', () => {
  it('anchors score time, schedules PCM, and releases the final source', async () => {
    const copiedChannels: number[] = [];
    const source = {
      buffer: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    };
    const destination = {} as AudioNode;
    const audioContext = {
      currentTime: 10,
      sampleRate: 44_100,
      destination,
      createBuffer: vi.fn(() => ({
        copyToChannel: (_values: Float32Array, channel: number) => copiedChannels.push(channel),
      })),
      createBufferSource: vi.fn(() => source),
    } as unknown as AudioContext;
    const floats = new Float32Array(1_024);
    const iterator = vi.fn(async () => [
      {
        chunk: new Uint8Array(floats.buffer),
        startTime: 2,
        endTime: 2 + 512 / 44_100,
        done: true,
      },
    ]) as SynthAudioBatchIterator;
    const sourcesRef = ref<AudioBufferSourceNode[]>([]);
    const iteratorRef = ref<SynthAudioBatchIterator | null>(null);
    const generationRef = ref(0);
    const onClockAnchor = vi.fn();
    const onEnded = vi.fn();

    await scheduleSynthBatchStream(iterator, audioContext, {
      sourcesRef,
      iteratorRef,
      generationRef,
      debugLabel: 'embedded-player',
      destination,
      onClockAnchor,
      onEnded,
    });

    expect(copiedChannels).toEqual([0, 1]);
    expect(source.connect).toHaveBeenCalledWith(destination);
    expect(source.start).toHaveBeenCalledWith(10.015);
    expect(onClockAnchor).toHaveBeenCalledWith({ contextTime: 10.015, scoreTimeSeconds: 2 });
    expect(sourcesRef.current).toHaveLength(1);

    source.onended?.();
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(sourcesRef.current).toEqual([]);
    expect(iteratorRef.current).toBeNull();
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it('stops and disconnects sources before awaiting iterator cancellation', async () => {
    let finishCancellation!: () => void;
    const cancellation = new Promise<void>((resolve) => {
      finishCancellation = resolve;
    });
    const iterator = vi.fn(async (cancel?: boolean) => {
      if (cancel) await cancellation;
      return [];
    }) as SynthAudioBatchIterator;
    const source = {
      stop: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as AudioBufferSourceNode;
    const sourcesRef = ref([source]);
    const iteratorRef = ref<SynthAudioBatchIterator | null>(iterator);

    const stopped = stopSynthStream(sourcesRef, iteratorRef, { awaitCancel: true });
    await Promise.resolve();

    expect(source.stop).toHaveBeenCalledOnce();
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(sourcesRef.current).toEqual([]);
    expect(iteratorRef.current).toBeNull();
    finishCancellation();
    await stopped;
    expect(iterator).toHaveBeenCalledWith(true);
  });

  it('invalidates stream ownership before awaiting cancellation', async () => {
    let finishCancellation!: () => void;
    const cancellation = new Promise<void>((resolve) => {
      finishCancellation = resolve;
    });
    const iterator = vi.fn(async (cancel?: boolean) => {
      if (cancel) await cancellation;
      return [];
    }) as SynthAudioBatchIterator;
    const target = {
      sourcesRef: ref<AudioBufferSourceNode[]>([]),
      iteratorRef: ref<SynthAudioBatchIterator | null>(iterator),
      generationRef: ref(7),
    };

    const stopped = cancelSynthStream(target, { awaitCancel: true });
    expect(target.generationRef.current).toBe(8);
    expect(target.iteratorRef.current).toBeNull();

    finishCancellation();
    await stopped;
  });

  it('does not let a superseded iterator tear down the replacement stream', async () => {
    let resolveOldBatch!: (value: []) => void;
    const oldBatch = new Promise<[]>((resolve) => {
      resolveOldBatch = resolve;
    });
    const oldIterator = vi.fn(async (cancel?: boolean) =>
      cancel ? [] : oldBatch,
    ) as unknown as SynthAudioBatchIterator;
    const floats = new Float32Array(1_024);
    const newIterator = vi.fn(async () => [
      {
        chunk: new Uint8Array(floats.buffer),
        startTime: 5,
        endTime: 5.1,
        done: true,
      },
    ]) as SynthAudioBatchIterator;
    const newSource = {
      buffer: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    };
    const audioContext = {
      currentTime: 2,
      sampleRate: 44_100,
      destination: {} as AudioNode,
      createBuffer: vi.fn(() => ({ copyToChannel: vi.fn() })),
      createBufferSource: vi.fn(() => newSource),
    } as unknown as AudioContext;
    const target = {
      sourcesRef: ref<AudioBufferSourceNode[]>([]),
      iteratorRef: ref<SynthAudioBatchIterator | null>(null),
      generationRef: ref(0),
    };

    const staleRun = scheduleSynthBatchStream(oldIterator, audioContext, {
      ...target,
      debugLabel: 'old',
    });
    await Promise.resolve();
    await cancelSynthStream(target, { awaitCancel: true });
    await scheduleSynthBatchStream(newIterator, audioContext, {
      ...target,
      debugLabel: 'new',
    });

    expect(target.iteratorRef.current).toBe(newIterator);
    expect(target.sourcesRef.current).toEqual([newSource]);
    resolveOldBatch([]);
    await staleRun;

    expect(newSource.stop).not.toHaveBeenCalled();
    expect(newSource.disconnect).not.toHaveBeenCalled();
    expect(target.iteratorRef.current).toBe(newIterator);
    expect(target.sourcesRef.current).toEqual([newSource]);
  });

  it('signals playing only when the first chunk starts', async () => {
    const sources = [0, 1].map(() => ({
      buffer: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    }));
    const audioContext = {
      currentTime: 0,
      sampleRate: 44_100,
      destination: {} as AudioNode,
      createBuffer: vi.fn(() => ({ copyToChannel: vi.fn() })),
      createBufferSource: vi.fn(() => sources.shift()),
    } as unknown as AudioContext;
    const floats = new Float32Array(1_024);
    const iterator = vi.fn(async () => [
      { chunk: new Uint8Array(floats.buffer), startTime: 0, endTime: 0.1, done: false },
      { chunk: new Uint8Array(floats.buffer), startTime: 0.1, endTime: 0.2, done: true },
    ]) as SynthAudioBatchIterator;
    const onPlayingChange = vi.fn();

    await scheduleSynthBatchStream(iterator, audioContext, {
      sourcesRef: ref([]),
      iteratorRef: ref<SynthAudioBatchIterator | null>(null),
      generationRef: ref(0),
      debugLabel: 'test',
      onPlayingChange,
    });

    expect(onPlayingChange).toHaveBeenCalledTimes(1);
    expect(onPlayingChange).toHaveBeenCalledWith(true);
  });

  it('throttles iterator pulls until buffered audio drains to the low-water mark', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      const floats = new Float32Array(1_024);
      let pull = 0;
      const iterator = vi.fn(async () => {
        pull += 1;
        return pull === 1
          ? [{ chunk: new Uint8Array(floats.buffer), startTime: 0, endTime: 25, done: false }]
          : [{ chunk: new Uint8Array(floats.buffer), startTime: 25, endTime: 25.1, done: true }];
      }) as SynthAudioBatchIterator;
      const audioContext = {
        get currentTime() {
          return Date.now() / 1000;
        },
        sampleRate: 44_100,
        destination: {} as AudioNode,
        createBuffer: vi.fn(() => ({ copyToChannel: vi.fn() })),
        createBufferSource: vi.fn(() => ({
          buffer: null,
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null as (() => void) | null,
        })),
      } as unknown as AudioContext;
      const onRenderWindowIdleChange = vi.fn();
      const run = scheduleSynthBatchStream(iterator, audioContext, {
        sourcesRef: ref([]),
        iteratorRef: ref<SynthAudioBatchIterator | null>(null),
        generationRef: ref(0),
        debugLabel: 'window-test',
        prerollSeconds: 0,
        renderWindow: { horizonSeconds: 20, lowWaterSeconds: 10 },
        onRenderWindowIdleChange,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(iterator).toHaveBeenCalledTimes(1);
      expect(onRenderWindowIdleChange).toHaveBeenCalledWith(true);

      await vi.advanceTimersByTimeAsync(14_000);
      expect(iterator).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1_000);
      await run;
      expect(iterator).toHaveBeenCalledTimes(2);
      expect(onRenderWindowIdleChange).toHaveBeenLastCalledWith(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
