import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScoreTransport } from '@/lib/playback/use-score-transport';
import type { SoundFontManager } from '@/lib/playback/soundfont-manager';
import type { Score, SynthAudioBatchIterator } from '@/lib/webmscore-loader';

const scoreWithIterator = (iterator?: SynthAudioBatchIterator) =>
  ({
    setSoundFont: vi.fn(),
    synthAudioBatch: vi.fn(
      async () => iterator ?? (vi.fn(async () => []) as SynthAudioBatchIterator),
    ),
  }) as unknown as Score;

const makeFallbackAudioContext = () => {
  let contextState: AudioContextState = 'running';
  const decodedBuffer = { duration: 20 } as AudioBuffer;
  const source = {
    buffer: null as AudioBuffer | null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as (() => void) | null,
  };
  const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    currentTime: 2,
    sampleRate: 44_100,
    get state() {
      return contextState;
    },
    destination: {} as AudioNode,
    createGain: vi.fn(() => gain),
    createBufferSource: vi.fn(() => source),
    decodeAudioData: vi.fn(async () => decodedBuffer),
    suspend: vi.fn(async () => {
      contextState = 'suspended';
    }),
    resume: vi.fn(async () => {
      contextState = 'running';
    }),
    close: vi.fn(async () => {
      contextState = 'closed';
    }),
  } as unknown as AudioContext;
  return { context, decodedBuffer, gain, source };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useScoreTransport', () => {
  it('forces a fresh soundfont attempt when retrying unavailable playback', async () => {
    const ensure = vi.fn(async () => false);
    const manager = { ensure, prefetch: vi.fn() } as unknown as SoundFontManager<Score>;
    const score = scoreWithIterator();
    const { result } = renderHook(() =>
      useScoreTransport({
        score,
        durationMs: 10_000,
        startMs: 0,
        volume: 1,
        soundFontManager: manager,
      }),
    );

    await act(async () => {
      await result.current.togglePlayPause();
    });
    expect(result.current.state).toBe('unavailable');
    expect(ensure).toHaveBeenNthCalledWith(1, score, { forceRetry: false });

    await act(async () => {
      await result.current.togglePlayPause();
    });
    expect(ensure).toHaveBeenNthCalledWith(2, score, { forceRetry: true });
  });

  it('uses explicit compatibility audio when streaming synthesis is unavailable', async () => {
    const fallbackAudio = makeFallbackAudioContext();
    vi.stubGlobal('AudioContext', function FakeAudioContext() {
      return fallbackAudio.context;
    });
    const score = {
      setSoundFont: vi.fn(),
      saveAudio: vi.fn(async () => new Uint8Array([1, 2, 3])),
    } as unknown as Score;
    const manager = {
      ensure: vi.fn(async () => true),
      prefetch: vi.fn(),
    } as unknown as SoundFontManager<Score>;
    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useScoreTransport({
        score,
        durationMs: 10_000,
        startMs: 0,
        volume: 0.75,
        soundFontManager: manager,
        onMessage,
      }),
    );

    await act(async () => {
      await result.current.togglePlayPause();
    });

    expect(score.saveAudio).toHaveBeenCalledWith('wav');
    expect(fallbackAudio.context.decodeAudioData).toHaveBeenCalledOnce();
    expect(fallbackAudio.gain.gain.value).toBe(0.75);
    expect(fallbackAudio.source.connect).toHaveBeenCalledWith(fallbackAudio.gain);
    expect(fallbackAudio.source.start).toHaveBeenCalledWith(0, 0);
    expect(result.current.fallbackMode).toBe(true);
    expect(result.current.state).toBe('playing');
    expect(onMessage).toHaveBeenCalledWith(
      'Streaming unavailable — preparing compatibility audio…',
    );
    expect(onMessage).toHaveBeenLastCalledWith('Compatibility audio');
  });

  it('falls back to compatibility audio when a streaming attempt fails', async () => {
    const fallbackAudio = makeFallbackAudioContext();
    vi.stubGlobal('AudioContext', function FakeAudioContext() {
      return fallbackAudio.context;
    });
    const score = {
      setSoundFont: vi.fn(),
      synthAudioBatch: vi.fn(async () => {
        throw new Error('stream failed');
      }),
      saveAudio: vi.fn(async () => new Uint8Array([1, 2, 3])),
    } as unknown as Score;
    const manager = {
      ensure: vi.fn(async () => true),
      prefetch: vi.fn(),
    } as unknown as SoundFontManager<Score>;
    const { result } = renderHook(() =>
      useScoreTransport({
        score,
        durationMs: 10_000,
        startMs: 0,
        volume: 1,
        soundFontManager: manager,
      }),
    );

    await act(async () => {
      await result.current.togglePlayPause();
    });

    expect(score.synthAudioBatch).toHaveBeenCalledOnce();
    expect(score.saveAudio).toHaveBeenCalledWith('wav');
    expect(result.current.fallbackMode).toBe(true);
    expect(result.current.state).toBe('playing');
  });

  it('does not latch a failed compatibility decode over later streaming retries', async () => {
    const fallbackAudio = makeFallbackAudioContext();
    vi.mocked(fallbackAudio.context.decodeAudioData).mockRejectedValue(
      new DOMException('unsupported', 'EncodingError'),
    );
    vi.stubGlobal('AudioContext', function FakeAudioContext() {
      return fallbackAudio.context;
    });
    const score = {
      setSoundFont: vi.fn(),
      synthAudioBatch: vi.fn(async () => {
        throw new Error('stream failed');
      }),
      saveAudio: vi.fn(async () => new Uint8Array([1, 2, 3])),
    } as unknown as Score;
    const manager = {
      ensure: vi.fn(async () => true),
      prefetch: vi.fn(),
    } as unknown as SoundFontManager<Score>;
    const { result } = renderHook(() =>
      useScoreTransport({
        score,
        durationMs: 10_000,
        startMs: 0,
        volume: 1,
        soundFontManager: manager,
      }),
    );

    await act(async () => {
      await result.current.togglePlayPause();
    });
    expect(result.current.state).toBe('unavailable');
    await act(async () => {
      await result.current.togglePlayPause();
    });

    expect(score.synthAudioBatch).toHaveBeenCalledTimes(2);
    expect(score.saveAudio).toHaveBeenCalledTimes(2);
  });

  it('reports AudioContext activation denial without rendering a WAV fallback', async () => {
    const blocked = new DOMException('activation required', 'NotAllowedError');
    const audioContext = {
      currentTime: 0,
      sampleRate: 44_100,
      state: 'suspended',
      destination: {} as AudioNode,
      createGain: vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() })),
      resume: vi.fn(async () => {
        throw blocked;
      }),
      close: vi.fn(async () => {}),
    } as unknown as AudioContext;
    vi.stubGlobal('AudioContext', function FakeAudioContext() {
      return audioContext;
    });
    const score = {
      setSoundFont: vi.fn(),
      saveAudio: vi.fn(async () => new Uint8Array([1, 2, 3])),
    } as unknown as Score;
    const manager = {
      ensure: vi.fn(async () => true),
      prefetch: vi.fn(),
    } as unknown as SoundFontManager<Score>;
    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useScoreTransport({
        score,
        durationMs: 10_000,
        startMs: 0,
        volume: 1,
        soundFontManager: manager,
        onMessage,
      }),
    );

    await act(async () => {
      await result.current.togglePlayPause();
    });

    expect(score.saveAudio).not.toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
    expect(onMessage).toHaveBeenLastCalledWith('Playback was blocked. Press Play to try again.');
  });

  it('does not change a paused transport back to playing when more PCM arrives', async () => {
    let resolveSecond!: (value: Awaited<ReturnType<SynthAudioBatchIterator>>) => void;
    const second = new Promise<Awaited<ReturnType<SynthAudioBatchIterator>>>((resolve) => {
      resolveSecond = resolve;
    });
    const floats = new Float32Array(1_024);
    let pull = 0;
    const iterator = vi.fn(async () => {
      pull += 1;
      if (pull === 1)
        return [
          {
            chunk: new Uint8Array(floats.buffer),
            startTime: 0,
            endTime: 0.1,
            done: false,
          },
        ];
      return second;
    }) as SynthAudioBatchIterator;
    const sources: Array<{ onended: (() => void) | null }> = [];
    let contextState: AudioContextState = 'running';
    const audioContext = {
      currentTime: 0,
      sampleRate: 44_100,
      get state() {
        return contextState;
      },
      destination: {} as AudioNode,
      createGain: vi.fn(() => ({
        gain: { value: 1 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createBuffer: vi.fn(() => ({ copyToChannel: vi.fn() })),
      createBufferSource: vi.fn(() => {
        const source = {
          buffer: null,
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null as (() => void) | null,
        };
        sources.push(source);
        return source;
      }),
      suspend: vi.fn(async () => {
        contextState = 'suspended';
      }),
      resume: vi.fn(async () => {
        contextState = 'running';
      }),
      close: vi.fn(async () => {
        contextState = 'closed';
      }),
    } as unknown as AudioContext;
    vi.stubGlobal('AudioContext', function FakeAudioContext() {
      return audioContext;
    });
    const manager = {
      ensure: vi.fn(async () => true),
      prefetch: vi.fn(),
    } as unknown as SoundFontManager<Score>;
    const { result } = renderHook(() =>
      useScoreTransport({
        score: scoreWithIterator(iterator),
        durationMs: 10_000,
        startMs: 0,
        volume: 1,
        soundFontManager: manager,
      }),
    );

    act(() => {
      void result.current.togglePlayPause();
    });
    await waitFor(() => expect(result.current.state).toBe('playing'));
    await act(async () => {
      await result.current.togglePlayPause();
    });
    expect(result.current.state).toBe('paused');

    await act(async () => {
      resolveSecond([
        {
          chunk: new Uint8Array(floats.buffer),
          startTime: 0.1,
          endTime: 0.2,
          done: true,
        },
      ]);
      await second;
    });
    expect(result.current.state).toBe('paused');
  });

  it('keeps a paused seek paused and re-synthesizes from that position on resume', async () => {
    const floats = new Float32Array(1_024);
    const makeIterator = (startTime: number) =>
      vi.fn(async (cancel?: boolean) =>
        cancel
          ? []
          : [
              {
                chunk: new Uint8Array(floats.buffer),
                startTime,
                endTime: startTime + 0.1,
                done: true,
              },
            ],
      ) as SynthAudioBatchIterator;
    const iterators = [makeIterator(0), makeIterator(4)];
    const synthAudioBatch = vi.fn(async () => iterators.shift()!);
    const score = { setSoundFont: vi.fn(), synthAudioBatch } as unknown as Score;
    let contextState: AudioContextState = 'running';
    const audioContext = {
      currentTime: 10,
      sampleRate: 44_100,
      get state() {
        return contextState;
      },
      destination: {} as AudioNode,
      createGain: vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() })),
      createBuffer: vi.fn(() => ({ copyToChannel: vi.fn() })),
      createBufferSource: vi.fn(() => ({
        buffer: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
      })),
      suspend: vi.fn(async () => {
        contextState = 'suspended';
      }),
      resume: vi.fn(async () => {
        contextState = 'running';
      }),
      close: vi.fn(async () => {
        contextState = 'closed';
      }),
    } as unknown as AudioContext;
    vi.stubGlobal('AudioContext', function FakeAudioContext() {
      return audioContext;
    });
    const manager = {
      ensure: vi.fn(async () => true),
      prefetch: vi.fn(),
    } as unknown as SoundFontManager<Score>;
    const { result } = renderHook(() =>
      useScoreTransport({
        score,
        durationMs: 10_000,
        startMs: 0,
        volume: 1,
        soundFontManager: manager,
      }),
    );

    await act(async () => {
      await result.current.togglePlayPause();
    });
    await act(async () => {
      await result.current.togglePlayPause();
    });
    act(() => {
      result.current.seek(4_000);
    });
    await waitFor(() => expect(result.current.positionMs).toBe(4_000));
    expect(result.current.state).toBe('paused');

    await act(async () => {
      await result.current.togglePlayPause();
    });
    expect(synthAudioBatch).toHaveBeenNthCalledWith(2, 4, 2);
    expect(result.current.state).toBe('playing');
  });

  it('adopts a paused seek target when Play supersedes its cancellation', async () => {
    let finishCancellation!: () => void;
    const cancellation = new Promise<void>((resolve) => {
      finishCancellation = resolve;
    });
    const floats = new Float32Array(1_024);
    const firstIterator = vi.fn(async (cancel?: boolean) => {
      if (cancel) await cancellation;
      return cancel
        ? []
        : [
            {
              chunk: new Uint8Array(floats.buffer),
              startTime: 0,
              endTime: 0.1,
              done: true,
            },
          ];
    }) as SynthAudioBatchIterator;
    const secondIterator = vi.fn(async () => [
      {
        chunk: new Uint8Array(floats.buffer),
        startTime: 4,
        endTime: 4.1,
        done: true,
      },
    ]) as SynthAudioBatchIterator;
    const iterators = [firstIterator, secondIterator];
    const synthAudioBatch = vi.fn(async () => iterators.shift()!);
    const score = { setSoundFont: vi.fn(), synthAudioBatch } as unknown as Score;
    let contextState: AudioContextState = 'running';
    const sourcesCreated: unknown[] = [];
    const audioContext = {
      currentTime: 10,
      sampleRate: 44_100,
      get state() {
        return contextState;
      },
      destination: {} as AudioNode,
      createGain: vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() })),
      createBuffer: vi.fn(() => ({ copyToChannel: vi.fn() })),
      createBufferSource: vi.fn(() => {
        const source = {
          buffer: null,
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null as (() => void) | null,
        };
        sourcesCreated.push(source);
        return source;
      }),
      suspend: vi.fn(async () => {
        contextState = 'suspended';
      }),
      resume: vi.fn(async () => {
        contextState = 'running';
      }),
      close: vi.fn(async () => {
        contextState = 'closed';
      }),
    } as unknown as AudioContext;
    vi.stubGlobal('AudioContext', function FakeAudioContext() {
      return audioContext;
    });
    const manager = {
      ensure: vi.fn(async () => true),
      prefetch: vi.fn(),
    } as unknown as SoundFontManager<Score>;
    const { result } = renderHook(() =>
      useScoreTransport({
        score,
        durationMs: 10_000,
        startMs: 0,
        volume: 1,
        soundFontManager: manager,
      }),
    );

    await act(async () => {
      await result.current.togglePlayPause();
    });
    await act(async () => {
      await result.current.togglePlayPause();
    });
    expect(result.current.state).toBe('paused');

    act(() => {
      result.current.seek(4_000);
      void result.current.togglePlayPause();
    });
    await waitFor(() => expect(synthAudioBatch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.state).toBe('playing'));
    expect(sourcesCreated).toHaveLength(2);
    expect(contextState).toBe('running');

    await act(async () => {
      finishCancellation();
      await cancellation;
    });
    expect(result.current.state).toBe('playing');
    expect(synthAudioBatch).toHaveBeenNthCalledWith(2, 4, 2);
    expect(result.current.positionMs).toBe(4_000);
  });

  it('restarts from the stop target when Play supersedes stop cancellation', async () => {
    let finishCancellation!: () => void;
    const cancellation = new Promise<void>((resolve) => {
      finishCancellation = resolve;
    });
    const floats = new Float32Array(1_024);
    const firstIterator = vi.fn(async (cancel?: boolean) => {
      if (cancel) await cancellation;
      return cancel
        ? []
        : [
            {
              chunk: new Uint8Array(floats.buffer),
              startTime: 3,
              endTime: 3.1,
              done: true,
            },
          ];
    }) as SynthAudioBatchIterator;
    const secondIterator = vi.fn(async () => [
      {
        chunk: new Uint8Array(floats.buffer),
        startTime: 1,
        endTime: 1.1,
        done: true,
      },
    ]) as SynthAudioBatchIterator;
    const synthAudioBatch = vi
      .fn()
      .mockResolvedValueOnce(firstIterator)
      .mockResolvedValueOnce(secondIterator);
    const score = { setSoundFont: vi.fn(), synthAudioBatch } as unknown as Score;
    let contextState: AudioContextState = 'running';
    const audioContext = {
      currentTime: 10,
      sampleRate: 44_100,
      get state() {
        return contextState;
      },
      destination: {} as AudioNode,
      createGain: vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() })),
      createBuffer: vi.fn(() => ({ copyToChannel: vi.fn() })),
      createBufferSource: vi.fn(() => ({
        buffer: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
      })),
      suspend: vi.fn(async () => {
        contextState = 'suspended';
      }),
      resume: vi.fn(async () => {
        contextState = 'running';
      }),
      close: vi.fn(async () => {
        contextState = 'closed';
      }),
    } as unknown as AudioContext;
    vi.stubGlobal('AudioContext', function FakeAudioContext() {
      return audioContext;
    });
    const manager = {
      ensure: vi.fn(async () => true),
      prefetch: vi.fn(),
    } as unknown as SoundFontManager<Score>;
    const { result } = renderHook(() =>
      useScoreTransport({
        score,
        durationMs: 10_000,
        startMs: 1_000,
        volume: 1,
        soundFontManager: manager,
      }),
    );

    await act(async () => {
      await result.current.togglePlayPause();
    });
    expect(result.current.state).toBe('playing');

    act(() => {
      void result.current.stopAt(1_000);
      void result.current.togglePlayPause();
    });
    await waitFor(() => expect(synthAudioBatch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.state).toBe('playing'));
    expect(synthAudioBatch).toHaveBeenNthCalledWith(2, 1, 2);

    await act(async () => {
      finishCancellation();
      await cancellation;
    });
    expect(result.current.state).toBe('playing');
    expect(result.current.positionMs).toBe(1_000);
  });
});
