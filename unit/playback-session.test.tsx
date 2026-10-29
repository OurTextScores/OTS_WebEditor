import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useScoreTransport } from '../lib/playback/use-score-transport';
import { guardPlaybackMutations } from '../components/score-editor/playback-session';
import type { Score, SynthAudioBatchIterator } from '../lib/webmscore-loader';
import { fakeAudioContext, block } from './helpers/fake-audio';

it('stops playback before moving notation to another staff', async () => {
  const order: string[] = [];
  const score = { moveSelectedChordRestToStaff: vi.fn(async (direction: 'up' | 'down') => {
    order.push(`move:${direction}`); return true;
  }) } as unknown as Score;
  const guarded = guardPlaybackMutations(score, async () => { order.push('stop'); });
  expect(await guarded.moveSelectedChordRestToStaff?.('up')).toBe(true);
  expect(order).toEqual(['stop', 'move:up']);
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const audio = () => {
  const fake = fakeAudioContext(2);
  vi.stubGlobal('AudioContext', function AudioContext() {
    return fake.context;
  });
  return fake;
};
beforeEach(() => {
  audio();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const setup = (score: Score, ensureSoundFont = vi.fn(async () => true)) =>
  renderHook(() =>
    useScoreTransport({ score, durationMs: 20_000, startMs: 0, volume: 1, ensureSoundFont }),
  );
const scoreFor = (iterator: SynthAudioBatchIterator) =>
  ({
    setSoundFont: vi.fn(),
    synthAudioBatch: vi.fn(async () => iterator),
  }) as unknown as Score;

describe('shared playback session boundaries', () => {
  it('activates the audio context on Play and cancels preparation before any iterator exists', async () => {
    const fake = audio();
    await fake.context.suspend();
    const font = deferred<boolean>();
    const ensure = vi.fn(() => font.promise);
    const score = scoreFor(async () => [block(0, { done: true })]);
    const hook = setup(score, ensure);
    let play!: Promise<void>;
    act(() => {
      play = hook.result.current.togglePlayPause();
    });
    expect(fake.context.resume).toHaveBeenCalledOnce();
    await waitFor(() => expect(ensure).toHaveBeenCalledOnce());
    let stop!: Promise<boolean>;
    act(() => {
      stop = hook.result.current.stopAt(0);
    });
    expect(hook.result.current.state).toBe('idle');
    font.resolve(true);
    await act(async () => {
      await stop;
      await play;
    });
    expect(score.synthAudioBatch).not.toHaveBeenCalled();
    expect(fake.sources).toHaveLength(0);
  });

  it('drains and cancels a late prepared iterator before allowing score destruction', async () => {
    const preparation = deferred<SynthAudioBatchIterator>();
    const iterator = vi.fn(async () => []);
    const destroy = vi.fn();
    const score = {
      setSoundFont: vi.fn(),
      synthAudioBatch: vi.fn(() => preparation.promise),
      destroy,
    } as unknown as Score;
    const hook = setup(score);
    let play!: Promise<void>;
    act(() => {
      play = hook.result.current.togglePlayPause();
    });
    await waitFor(() => expect(score.synthAudioBatch).toHaveBeenCalledOnce());
    const guarded = guardPlaybackMutations(score, async () => {
      await hook.result.current.stopAt(0);
    });
    let destruction!: Promise<void>;
    act(() => {
      destruction = Promise.resolve(guarded.destroy());
    });
    expect(destroy).not.toHaveBeenCalled();
    preparation.resolve(iterator);
    await act(async () => {
      await destruction;
      await play;
    });
    expect(iterator).toHaveBeenCalledExactlyOnceWith(true);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('stops notation edits once while ordinary selection keeps the source alive', async () => {
    const fake = audio();
    const iterator = vi.fn(async (cancel?: boolean) => (cancel ? [] : [block(0, { done: true })]));
    const pitchUp = vi.fn(async () => true);
    const selectAll = vi.fn(async () => true);
    const relayout = vi.fn(async () => true);
    // Compare reflow writes these to a score a compare pane may be playing; neither changes the audio.
    const setLayoutMode = vi.fn(async () => true);
    const setMeasureLineBreaks = vi.fn(async () => true);
    const score = Object.assign(scoreFor(iterator), {
      pitchUp,
      selectAll,
      relayout,
      setLayoutMode,
      setMeasureLineBreaks,
    });
    const hook = setup(score);
    await act(async () => {
      await hook.result.current.togglePlayPause();
    });
    const guard = guardPlaybackMutations(score, async () => {
      if (hook.result.current.stateRef.current === 'playing') await hook.result.current.stopAt(0);
    });
    await guard.selectAll?.();
    await guard.relayout?.();
    await guard.setLayoutMode?.(0);
    await guard.setMeasureLineBreaks?.([true, false]);
    expect(setMeasureLineBreaks).toHaveBeenCalledWith([true, false]);
    expect(fake.sources[0].stopped).toBe(false);
    expect(iterator).not.toHaveBeenCalledWith(true);
    await act(async () => {
      await guard.pitchUp?.();
      await guard.pitchUp?.();
    });
    expect(iterator.mock.calls.filter(([cancel]) => cancel)).toHaveLength(1);
    expect(fake.sources[0].stopped).toBe(true);
    expect(pitchUp).toHaveBeenCalledTimes(2);
  });

  it('keeps a cancelled attempt from clearing a newer attempt or scheduling its PCM', async () => {
    const fake = audio();
    const first = deferred<SynthAudioBatchIterator>();
    const stale = vi.fn(async () => []);
    const current = vi.fn(async (cancel?: boolean) => (cancel ? [] : [block(5, { done: true })]));
    const synth = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(current);
    const score = { setSoundFont: vi.fn(), synthAudioBatch: synth } as unknown as Score;
    const hook = setup(score);
    let old!: Promise<void>;
    act(() => {
      old = hook.result.current.start({}, 0);
    });
    await waitFor(() => expect(synth).toHaveBeenCalledOnce());
    await act(async () => {
      await hook.result.current.start({}, 5000);
    });
    first.resolve(stale);
    await act(async () => {
      await old;
    });
    expect(stale).toHaveBeenCalledExactlyOnceWith(true);
    expect(hook.result.current.state).toBe('playing');
    expect(fake.sources).toHaveLength(1);
    expect(hook.result.current.clockRef.current?.scoreTimeSeconds).toBe(5);
  });

  it('accepts a range/selection factory and keeps its absolute score timestamps', async () => {
    const fake = audio();
    const hook = setup(scoreFor(async () => []));
    const iterator = vi.fn(async () => [block(8, { done: true })]);
    const factory = vi.fn(async () => iterator);
    await act(async () => {
      await hook.result.current.start({ createIterator: factory, allowFallback: false }, 8000);
    });
    expect(factory).toHaveBeenCalledWith(expect.anything(), 8, expect.any(Function));
    expect(hook.result.current.clockRef.current).toEqual({
      contextTime: 2.015,
      scoreTimeSeconds: 8,
    });
    expect(fake.sources).toHaveLength(1);
  });
});

it('publishes presentation frames to subscribers without re-rendering the editor adapter', async () => {
  const fake = audio();
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  const iterator = vi.fn(async () => [block(3, { done: true })]);
  const score = scoreFor(iterator);
  let renders = 0;
  const hook = renderHook(() => {
    renders += 1;
    return useScoreTransport({
      score,
      durationMs: 20_000,
      startMs: 0,
      volume: 1,
      publishProgress: false,
      ensureSoundFont: async () => true,
    });
  });
  await act(async () => {
    await hook.result.current.start({}, 3000);
  });
  const initialRenders = renders;
  const notify = vi.fn();
  const unsubscribe = hook.result.current.subscribePosition(notify);
  fake.setNow(3.015);
  act(() => {
    frames.at(-1)?.(performance.now());
  });
  expect(hook.result.current.positionRef.current).toBeCloseTo(4000, 4);
  expect(notify).toHaveBeenCalledOnce();
  expect(renders).toBe(initialRenders);
  expect(iterator).toHaveBeenCalledOnce();
  unsubscribe();
  hook.unmount();
  vi.restoreAllMocks();
});

it('releases browser sources and iterator ownership across repeated Play/Stop sessions', async () => {
  const fake = audio();
  const score = scoreFor(async (cancel) => (cancel ? [] : [block(0, { done: true })]));
  const hook = setup(score);
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await act(async () => {
      await hook.result.current.start();
    });
    await act(async () => {
      await hook.result.current.stopAt(0);
    });
    expect(hook.result.current.diagnostics()).toEqual({
      pendingOperations: 0,
      scheduledSources: 0,
      activeIterator: false,
      underflows: 0,
    });
  }
  expect(fake.sources).toHaveLength(25);
  expect(fake.sources.every((source) => source.stopped && source.disconnected)).toBe(true);
});

it('freezes presentation while buffering and resumes from the new audible anchor', async () => {
  const fake = audio();
  const second = deferred<Awaited<ReturnType<SynthAudioBatchIterator>>>();
  let pull = 0;
  const hook = setup(
    scoreFor(async (cancel) => (cancel ? [] : ++pull === 1 ? [block(0)] : second.promise)),
  );
  let play!: Promise<void>;
  act(() => {
    play = hook.result.current.start();
  });
  await waitFor(() => expect(hook.result.current.state).toBe('playing'));
  fake.setNow(2.2);
  await waitFor(() => expect(hook.result.current.phase).toBe('buffering'));
  expect(hook.result.current.clockRef.current).toBeNull();
  expect(hook.result.current.positionRef.current).toBeCloseTo((512 / 44100) * 1000, 4);
  second.resolve([block(512 / 44100, { done: true })]);
  await act(async () => {
    await play;
  });
  expect(hook.result.current.phase).toBe('draining');
  expect(hook.result.current.clockRef.current?.contextTime).toBeCloseTo(2.215, 6);
  expect(hook.result.current.clockRef.current?.scoreTimeSeconds).toBeCloseTo(512 / 44100, 6);
  expect(hook.result.current.diagnostics().underflows).toBe(1);
});

it('uses the same held count-in and paused clock for compatibility WAV playback', async () => {
  const fake = audio();
  const decoded = { duration: 4 } as AudioBuffer;
  const decode = vi.fn(async () => decoded);
  Object.assign(fake.context, { decodeAudioData: decode });
  const score = {
    setSoundFont: vi.fn(),
    saveAudio: vi.fn(async () => new Uint8Array([0])),
  } as unknown as Score;
  const hook = setup(score);
  await act(async () => {
    await hook.result.current.start({
      click: {
        enabled: true,
        countIn: true,
        timeline: {
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
              beatsPerMeasure: 4,
              downbeat: true,
            },
          ],
        },
      },
    });
  });
  const music = fake.sources.find((source) => (source.buffer as unknown) === decoded);
  expect(music?.startedAt).toBe(4);
  expect(hook.result.current.phase).toBe('count-in');
  expect(hook.result.current.clockRef.current).toEqual({ contextTime: 4, scoreTimeSeconds: 0 });
  await act(async () => {
    await hook.result.current.togglePlayPause();
  });
  expect(hook.result.current.phase).toBe('paused');
  await act(async () => {
    await hook.result.current.togglePlayPause();
  });
  expect(hook.result.current.phase).toBe('count-in');
  expect(decode).toHaveBeenCalledOnce();
  expect(score.saveAudio).toHaveBeenCalledOnce();
});

it('finishes an empty stream instead of leaving the transport preparing', async () => {
  const hook = setup(scoreFor(async () => []));
  await act(async () => {
    await hook.result.current.start();
  });
  expect(hook.result.current.state).toBe('ended');
  expect(hook.result.current.phase).toBe('ended');
  expect(hook.result.current.diagnostics().scheduledSources).toBe(0);
});

it('awaits an in-flight idle warmup before score destruction', async () => {
  const prepared = deferred<boolean>();
  const warmupPlayback = vi.fn(() => prepared.promise);
  const destroy = vi.fn();
  const score = Object.assign(
    scoreFor(async () => []),
    { warmupPlayback, destroy },
  );
  const hook = setup(score);
  const guard = guardPlaybackMutations(score, async () => {
    await hook.result.current.stopAt(0);
  });
  let warm!: Promise<boolean>, retired!: Promise<void>;
  act(() => {
    warm = hook.result.current.warmupPlayback();
  });
  act(() => {
    retired = Promise.resolve(guard.destroy());
  });
  expect(destroy).not.toHaveBeenCalled();
  prepared.resolve(true);
  await act(async () => {
    await warm;
    await retired;
  });
  expect(destroy).toHaveBeenCalledOnce();
});
