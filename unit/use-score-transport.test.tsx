import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScoreTransport } from '@/lib/playback/use-score-transport';
import type { SoundFontManager } from '@/lib/playback/soundfont-manager';
import type { PlaybackTimeline, Score, SynthAudioBatchIterator } from '@/lib/webmscore-loader';
import { fakeAudioContext } from './helpers/fake-audio';

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

describe('useScoreTransport click track', () => {
  const TIMELINE: PlaybackTimeline = {
    schemaVersion: 1,
    durationMs: 4000,
    renderDurationMs: 4000,
    occurrences: [
      {
        occurrenceIndex: 0,
        measureIndex: 0,
        startMs: 0,
        endMs: 2000,
        beatsMs: [0, 500, 1000, 1500],
        downbeat: true,
        beatsPerMeasure: 4,
      },
      {
        occurrenceIndex: 1,
        measureIndex: 1,
        startMs: 2000,
        endMs: 4000,
        beatsMs: [2000, 2500, 3000, 3500],
        downbeat: true,
        beatsPerMeasure: 4,
      },
    ],
  };
  /** The engine's first block starts at the score time asked for. */
  const music = (startSeconds = 0) => {
    const floats = new Float32Array(1_024);
    return vi.fn(async (cancel?: boolean) =>
      cancel
        ? []
        : [
            {
              chunk: new Uint8Array(floats.buffer),
              startTime: startSeconds,
              endTime: startSeconds + 0.1,
              done: true,
            },
          ],
    ) as unknown as SynthAudioBatchIterator;
  };
  const play = async (click: { enabled: boolean; countIn: boolean }, startMs = 0) => {
    const audio = fakeAudioContext(1);
    vi.stubGlobal('AudioContext', function FakeAudioContext() {
      return audio.context;
    });
    const manager = {
      ensure: vi.fn(async () => true),
      prefetch: vi.fn(),
    } as unknown as SoundFontManager<Score>;
    const score = scoreWithIterator(music(startMs / 1000));
    const hook = renderHook(
      (props: { enabled: boolean; countIn: boolean }) =>
        useScoreTransport({
          score,
          durationMs: 4000,
          startMs,
          volume: 1,
          soundFontManager: manager,
          click: { ...props, timeline: TIMELINE },
        }),
      { initialProps: click },
    );
    await act(async () => {
      await hook.result.current.togglePlayPause();
    });
    await waitFor(() => expect(audio.sources.length).toBeGreaterThan(0));
    return { audio, hook };
  };
  /** The click sources are those whose buffer is one of the two click sounds (30 ms: 1,323 frames). */
  const clickSources = (audio: ReturnType<typeof fakeAudioContext>) =>
    audio.sources.filter((source) => source.buffer?.frames === 1_323);
  const musicSources = (audio: ReturnType<typeof fakeAudioContext>) =>
    audio.sources.filter((source) => source.buffer?.frames !== 1_323);

  /** Moves the audio clock and lets the click scheduler's (real) look-ahead timer run. */
  const playhead = async (audio: ReturnType<typeof fakeAudioContext>, seconds: number) => {
    audio.setNow(seconds);
    await new Promise((resolve) => setTimeout(resolve, 160));
  };
  const relativeTo = (audio: ReturnType<typeof fakeAudioContext>, music0: number) =>
    clickSources(audio).map((source) => Math.round((source.startedAt! - music0) * 1000));

  it('plays no clicks unless asked', async () => {
    const { audio } = await play({ enabled: false, countIn: false });
    await playhead(audio, 5);
    expect(clickSources(audio)).toEqual([]);
  });

  it('clicks every beat on the music’s own clock, scheduled as the clock advances', async () => {
    const { audio } = await play({ enabled: true, countIn: false });
    const music0 = musicSources(audio)[0].startedAt!;
    // Only the look-ahead window is scheduled at first.
    expect(relativeTo(audio, music0)).toEqual([0, 500, 1000]);
    await playhead(audio, music0 + 1);
    expect(relativeTo(audio, music0)).toEqual([0, 500, 1000, 1500, 2000, 2500]);
    await playhead(audio, music0 + 2.5);
    expect(relativeTo(audio, music0)).toEqual([0, 500, 1000, 1500, 2000, 2500, 3000, 3500]);
  });

  it('counts in one measure and delays the music by it, the clicks continuing into the music', async () => {
    const { audio } = await play({ enabled: true, countIn: true });
    const music0 = musicSources(audio)[0].startedAt!;
    // Playback was requested at context time 1; the music starts after the preroll and a two-second count-in.
    expect(music0).toBeCloseTo(1 + 0.015 + 2, 6);
    expect(relativeTo(audio, music0)).toEqual([-2000, -1500, -1000]);
    await playhead(audio, music0 - 1);
    expect(relativeTo(audio, music0)).toEqual([-2000, -1500, -1000, -500, 0, 500]);
  });

  it('starts a mid-score play with clicks from that point, counted in at that tempo', async () => {
    const { audio } = await play({ enabled: true, countIn: true }, 2000);
    const music0 = musicSources(audio)[0].startedAt!;
    expect(relativeTo(audio, music0).slice(0, 3)).toEqual([-2000, -1500, -1000]);
    await playhead(audio, music0 - 0.5);
    expect(relativeTo(audio, music0)).toEqual([-2000, -1500, -1000, -500, 0, 500, 1000]);
  });

  it('stops the clicks at once when the click is switched off during playback', async () => {
    const { audio, hook } = await play({ enabled: true, countIn: false });
    const scheduled = clickSources(audio);
    expect(scheduled.length).toBeGreaterThan(0);
    hook.rerender({ enabled: false, countIn: false });
    expect(scheduled.every((source) => source.stopped)).toBe(true);
  });

  it('starts the clicks from the playhead when the click is switched on during playback', async () => {
    const { audio, hook } = await play({ enabled: false, countIn: false });
    expect(clickSources(audio)).toEqual([]);
    const music0 = musicSources(audio)[0].startedAt!;
    // The music is 1.2 s in; the next beat is at 1.5 s.
    audio.setNow(music0 + 1.2);
    await act(async () => {
      hook.result.current.positionRef.current = 1200;
      hook.rerender({ enabled: true, countIn: false });
    });
    expect(relativeTo(audio, music0)).toEqual([1500, 2000, 2500]);
  });

  it('stops the clicks when a new score resets the transport', async () => {
    const { audio, hook } = await play({ enabled: true, countIn: false });
    const scheduled = clickSources(audio);
    act(() => hook.result.current.reset(0));
    expect(scheduled.every((source) => source.stopped)).toBe(true);
  });

  it('stops the clicks when the transport is torn down', async () => {
    const { audio, hook } = await play({ enabled: true, countIn: false });
    const scheduled = clickSources(audio);
    hook.unmount();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(scheduled.every((source) => source.stopped)).toBe(true);
  });

  it('cancels the clicks when playback stops', async () => {
    const { audio, hook } = await play({ enabled: true, countIn: false });
    const scheduled = clickSources(audio);
    expect(scheduled.length).toBeGreaterThan(0);
    await act(async () => {
      await hook.result.current.stopAt(0);
    });
    expect(scheduled.every((source) => source.stopped)).toBe(true);
  });
});
