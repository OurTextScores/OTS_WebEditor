import { vi } from 'vitest';
import type { MutableRefObject } from 'react';
import type { SynthAudioBatchChunk, SynthAudioBatchIterator } from '@/lib/webmscore-loader';

/** The frames of one mono block (the scheduler reads 512 frames per channel: 1,024 floats is stereo, 512 is mono). */
export const BLOCK_FRAMES = 512;
export const SAMPLE_RATE = 44_100;
export const BLOCK_SECONDS = BLOCK_FRAMES / SAMPLE_RATE;

export const ref = <T>(current: T) => ({ current }) as MutableRefObject<T>;

export interface FakeSource {
  buffer: FakeBuffer | null;
  startedAt: number | null;
  stopped: boolean;
  disconnected: boolean;
  connectedTo: unknown;
  onended: (() => void) | null;
  connect: (node: unknown) => void;
  disconnect: () => void;
  start: (when: number) => void;
  stop: () => void;
  /** The audio clock reaching the end of this source. */
  finish: () => void;
}

export interface FakeBuffer {
  channels: number;
  frames: number;
  data: Float32Array[];
  copyToChannel: (values: Float32Array, channel: number) => void;
}

/**
 * An `AudioContext` with a clock the test moves, recording every buffer and source the scheduler creates. `advance`
 * moves the audio clock and the fake timers together, so waits inside the scheduler elapse with the audio clock.
 */
export function fakeAudioContext(startTime = 0) {
  let now = startTime;
  const sources: FakeSource[] = [];
  const buffers: FakeBuffer[] = [];
  let contextState: AudioContextState = 'running';
  const destination = { name: 'destination' };
  const gains: {
    gain: { value: number };
    connectedTo: unknown;
    connect: (node: unknown) => void;
  }[] = [];
  const context = {
    get currentTime() {
      return now;
    },
    sampleRate: SAMPLE_RATE,
    get state() {
      return contextState;
    },
    suspend: vi.fn(async () => {
      contextState = 'suspended';
    }),
    resume: vi.fn(async () => {
      contextState = 'running';
    }),
    close: vi.fn(async () => {
      contextState = 'closed';
    }),
    destination,
    createGain: vi.fn(() => {
      const gain = {
        gain: { value: 1 },
        connectedTo: undefined as unknown,
        connect(node: unknown) {
          gain.connectedTo = node;
        },
      };
      gains.push(gain);
      return gain;
    }),
    createBuffer: vi.fn((channels: number, frames: number) => {
      const buffer: FakeBuffer = {
        channels,
        frames,
        data: Array.from({ length: channels }, () => new Float32Array(frames)),
        copyToChannel(values, channel) {
          buffer.data[channel].set(values);
        },
      };
      buffers.push(buffer);
      return buffer;
    }),
    createBufferSource: vi.fn(() => {
      const source: FakeSource = {
        buffer: null,
        startedAt: null,
        stopped: false,
        disconnected: false,
        connectedTo: undefined,
        onended: null,
        connect(node) {
          source.connectedTo = node;
        },
        disconnect() {
          source.disconnected = true;
        },
        start(when) {
          source.startedAt = when;
        },
        stop() {
          source.stopped = true;
        },
        finish() {
          source.onended?.();
        },
      };
      sources.push(source);
      return source;
    }),
  };
  return {
    context: context as unknown as AudioContext,
    sources,
    buffers,
    gains,
    destination,
    get now() {
      return now;
    },
    /** Sets the audio clock without touching timers (for tests on real timers). */
    setNow(seconds: number) {
      now = seconds;
    },
    /** Moves the audio clock and the fake timers forward together. */
    async advance(seconds: number) {
      now += seconds;
      await vi.advanceTimersByTimeAsync(seconds * 1000);
    },
    /** Marks every source whose scheduled end is at or before the clock as finished. */
    finishPlayedSources() {
      for (const source of sources) {
        if (source.startedAt !== null && source.buffer && !source.disconnected) {
          const end = source.startedAt + source.buffer.frames / SAMPLE_RATE;
          if (end <= now) source.finish();
        }
      }
    },
  };
}

/** One block as the engine returns it: stereo floats, 1,024 per block, or 512 for mono. */
export const block = (
  startTime: number,
  options: { seconds?: number; done?: boolean; channels?: 1 | 2 | 4; fill?: number } = {},
): SynthAudioBatchChunk => {
  const channels = options.channels ?? 2;
  const floats = new Float32Array(BLOCK_FRAMES * channels).fill(options.fill ?? 0.25);
  return {
    chunk: new Uint8Array(floats.buffer),
    startTime,
    endTime: startTime + (options.seconds ?? BLOCK_SECONDS),
    done: options.done,
  };
};

/**
 * An iterator that hands out the scripted batches in order, then an empty batch. `pulls` counts calls (cancel
 * included); `cancelled` records that cancel arrived.
 */
export function scriptedIterator(
  batches: SynthAudioBatchChunk[][],
  /** Runs at the start of every pull (to move the audio clock while the engine renders). */
  onPull?: (pull: number) => void,
) {
  const state = { pulls: 0, cancelled: false, queue: [...batches] };
  const iterator = vi.fn(async (cancel?: boolean) => {
    if (cancel) {
      state.cancelled = true;
      return [];
    }
    state.pulls += 1;
    onPull?.(state.pulls);
    return state.queue.shift() ?? [];
  }) as unknown as SynthAudioBatchIterator;
  return Object.assign(iterator, { state });
}
