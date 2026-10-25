import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScoreTransport } from '@/lib/playback/use-score-transport';
import type { SoundFontManager } from '@/lib/playback/soundfont-manager';
import type {
  MusicalPlaybackPosition,
  PlaybackOptionsRequest,
  PlaybackTimeline,
  Score,
  SynthAudioBatchIterator,
} from '@/lib/webmscore-loader';
import { fakeAudioContext } from './helpers/fake-audio';

const timelineAt = (multiplier: number, revision: number): PlaybackTimeline => ({
  schemaVersion: 1,
  optionsRevision: revision,
  durationMs: 4000 / multiplier,
  renderDurationMs: 4000 / multiplier + 3000,
  occurrences: [0, 1].map((index) => ({
    occurrenceIndex: index,
    measureIndex: index,
    startMs: (index * 2000) / multiplier,
    endMs: ((index + 1) * 2000) / multiplier,
    beatsMs: [0, 500, 1000, 1500].map((beat) => (index * 2000 + beat) / multiplier),
    downbeat: true,
    beatsPerMeasure: 4,
  })),
});

/** The engine's first block starts at the score time asked for; it stays scheduled until the test finishes it. */
const music = (startSeconds: number) => {
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

/**
 * A native-like options model: one written tick per millisecond at 100%, so a location's time is tick / multiplier.
 * `hold` defers the next native change, to act while the transaction is in flight.
 */
function optionsScore(extra: Partial<Score> = {}) {
  let multiplier = 1;
  let playRepeats = true;
  let revision = 0;
  let hold: Promise<void> | null = null;
  let failNext = false;
  const beforeNative: Array<() => void> = [];
  const native = vi.fn(async (next: PlaybackOptionsRequest) => {
    if (hold) await hold;
    beforeNative.forEach((check) => check());
    if (failNext) {
      failNext = false;
      throw new Error('native options failed');
    }
    const changed = next.tempoMultiplier !== multiplier || next.playRepeats !== playRepeats;
    if (changed) revision += 1;
    multiplier = next.tempoMultiplier;
    playRepeats = next.playRepeats;
    return { schemaVersion: 1 as const, ...next, revision, changed };
  });
  const score = {
    setSoundFont: vi.fn(),
    synthAudioBatch: vi.fn(async (startSeconds: number) => music(startSeconds)),
    setPlaybackOptions: native,
    playbackTimeline: vi.fn(async () => timelineAt(multiplier, revision)),
    playbackOptions: vi.fn(async () => ({
      schemaVersion: 1 as const,
      tempoMultiplier: multiplier,
      playRepeats,
      revision,
    })),
    playbackPositionAt: vi.fn(async (timeMs: number): Promise<MusicalPlaybackPosition> => ({
      schemaVersion: 1,
      optionsRevision: revision,
      timeMs,
      writtenTick: Math.floor(timeMs * multiplier),
      fractionalTick: timeMs * multiplier,
      occurrenceIndex: 0,
      pass: 0,
      occurrenceKey: `${Math.floor(timeMs * multiplier)}:0`,
      atEnd: false,
    })),
    playbackTimeForPosition: vi.fn(async (position: { fractionalTick: number }) => ({
      schemaVersion: 1 as const,
      optionsRevision: revision,
      timeMs: position.fractionalTick / multiplier,
      writtenTick: Math.floor(position.fractionalTick),
      pass: 0,
      exact: true,
      fallback: null,
    })),
    ...extra,
  } as unknown as Score;
  return {
    score,
    native,
    beforeNative,
    failOnce() {
      failNext = true;
    },
    holdNext() {
      let release!: () => void;
      hold = new Promise<void>((resolve) => {
        release = () => {
          hold = null;
          resolve();
        };
      });
      return release;
    },
  };
}

function mount(score: Score, click?: { enabled: boolean; countIn: boolean }) {
  const audio = fakeAudioContext(1);
  vi.stubGlobal('AudioContext', function FakeAudioContext() {
    return audio.context;
  });
  const manager = {
    ensure: vi.fn(async () => true),
    prefetch: vi.fn(),
  } as unknown as SoundFontManager<Score>;
  const hook = renderHook(() =>
    useScoreTransport({
      score,
      durationMs: 4000,
      startMs: 0,
      volume: 1,
      soundFontManager: manager,
      click: click ? { ...click, timeline: timelineAt(1, 0) } : undefined,
    }),
  );
  return { audio, hook, result: hook.result };
}

/** Plays, then moves the audio clock `seconds` past the music's start. */
async function playTo(view: ReturnType<typeof mount>, seconds: number) {
  await act(async () => {
    await view.result.current.togglePlayPause();
  });
  await waitFor(() => expect(view.audio.sources.length).toBeGreaterThan(0));
  const musicStart = view.result.current.clockRef.current!.contextTime;
  view.audio.setNow(musicStart + seconds);
}

const startTimes = (score: Score) =>
  vi.mocked(score.synthAudioBatch!).mock.calls.map(([seconds]) => seconds);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('playback options on the shared transport', () => {
  it('restarts playing audio at the same musical location in the new time base, past the old duration', async () => {
    const { score, native } = optionsScore();
    const view = mount(score);
    await playTo(view, 3);

    let change: Awaited<ReturnType<typeof view.result.current.setPlaybackOptions>>;
    await act(async () => {
      change = await view.result.current.setPlaybackOptions({
        tempoMultiplier: 0.5,
        playRepeats: true,
      });
    });

    expect(native).toHaveBeenCalledOnce();
    expect(change!).toMatchObject({ status: 'applied', fromMs: 3000, toMs: 6000 });
    expect(change!.timeline?.optionsRevision).toBe(change!.accepted?.revision);
    await waitFor(() => expect(startTimes(score)).toEqual([0, 6]));
    expect(view.result.current.state).toBe('playing');
    // 6 s exceeds the 4 s duration the host still passes: the transport knows the new duration.
    expect(view.result.current.positionRef.current).toBe(6000);
    expect(view.result.current.playbackOptions).toMatchObject({
      tempoMultiplier: 0.5,
      revision: 1,
    });
  });

  it('retires old-option audio before the native change and does not replay the count-in', async () => {
    const { score, beforeNative } = optionsScore();
    const view = mount(score, { enabled: true, countIn: true });
    await playTo(view, 1);
    const firstSources = [...view.audio.sources];
    const stoppedAtChange: boolean[] = [];
    beforeNative.push(() => stoppedAtChange.push(firstSources.every((source) => source.stopped)));

    await act(async () => {
      await view.result.current.setPlaybackOptions({ tempoMultiplier: 2, playRepeats: true });
    });
    expect(stoppedAtChange).toEqual([true]);
    await waitFor(() => expect(startTimes(score)).toHaveLength(2));
    expect(startTimes(score)[1]).toBeCloseTo(0.5, 9);
    // Click sounds are 30 ms buffers (1,323 frames); the rest is music.
    const restartedMusic = () =>
      view.audio.sources.filter(
        (source) => !firstSources.includes(source) && source.buffer?.frames !== 1_323,
      );
    await waitFor(() => expect(restartedMusic().length).toBeGreaterThan(0));
    // A count-in delays the music by a measure (2 s here); a resumed stream starts after the preroll alone.
    const startedAt = restartedMusic()[0].startedAt!;
    expect(startedAt - view.audio.context.currentTime).toBeLessThan(0.5);
    expect(view.result.current.phase).not.toBe('count-in');
  });

  it('keeps a paused session paused at the mapped location and renders it only on resume', async () => {
    const { score } = optionsScore();
    const view = mount(score);
    await playTo(view, 2);
    await act(async () => {
      await view.result.current.togglePlayPause();
    });
    expect(view.result.current.state).toBe('paused');

    await act(async () => {
      await view.result.current.setPlaybackOptions({ tempoMultiplier: 0.5, playRepeats: true });
    });
    expect(view.result.current.state).toBe('paused');
    expect(view.result.current.positionRef.current).toBeCloseTo(4000, 6);
    expect(startTimes(score)).toEqual([0]);

    await act(async () => {
      await view.result.current.togglePlayPause();
    });
    await waitFor(() => expect(startTimes(score)).toHaveLength(2));
    expect(startTimes(score)[1]).toBeCloseTo(4, 9);
    expect(view.result.current.state).toBe('playing');
  });

  it('coalesces rapid changes into one native transaction and one restart, latest value winning', async () => {
    const { score, native } = optionsScore();
    const view = mount(score);
    await playTo(view, 1);

    let results: Awaited<ReturnType<typeof view.result.current.setPlaybackOptions>>[] = [];
    await act(async () => {
      results = await Promise.all([
        view.result.current.setPlaybackOptions({ tempoMultiplier: 0.75, playRepeats: true }),
        view.result.current.setPlaybackOptions({ tempoMultiplier: 1.25, playRepeats: false }),
        view.result.current.setPlaybackOptions({ tempoMultiplier: 0.5, playRepeats: true }),
      ]);
    });

    expect(native.mock.calls.map(([next]) => next)).toEqual([
      { tempoMultiplier: 0.5, playRepeats: true },
    ]);
    expect(new Set(results).size).toBe(1);
    await waitFor(() => expect(startTimes(score)).toHaveLength(2));
    expect(startTimes(score)[1]).toBeCloseTo(2, 9);
  });

  it('applies a request that arrives mid-transaction before restarting, mapped from the original location', async () => {
    const { score, native, holdNext } = optionsScore();
    const view = mount(score);
    await playTo(view, 1);
    const release = holdNext();
    let first!: Promise<unknown>;
    act(() => {
      first = view.result.current.setPlaybackOptions({ tempoMultiplier: 0.5, playRepeats: true });
    });
    await waitFor(() => expect(native).toHaveBeenCalledOnce());
    const second = view.result.current.setPlaybackOptions({
      tempoMultiplier: 2,
      playRepeats: true,
    });
    await act(async () => {
      release();
      await first;
    });
    expect(await second).toBe(await first);
    expect(native).toHaveBeenCalledTimes(2);
    // One restart, at 1 s of music under the final 200% tempo.
    await waitFor(() => expect(startTimes(score)).toHaveLength(2));
    expect(startTimes(score)[1]).toBeCloseTo(0.5, 9);
  });

  it('lets Stop during the transaction win over the resume', async () => {
    const { score, holdNext } = optionsScore();
    const view = mount(score);
    await playTo(view, 1);
    const release = holdNext();
    let change!: Promise<unknown>;
    act(() => {
      change = view.result.current.setPlaybackOptions({ tempoMultiplier: 0.5, playRepeats: true });
    });
    await act(async () => {
      await view.result.current.stopAt(0);
    });
    await act(async () => {
      release();
      await change;
    });
    expect(startTimes(score)).toEqual([0]);
    expect(view.result.current.state).toBe('idle');
  });

  it('holds a Play pressed mid-transaction until the options settle, and moves its target with them', async () => {
    const { score, holdNext } = optionsScore();
    const view = mount(score);
    act(() => {
      view.result.current.seek(1000);
    });
    await waitFor(() => expect(view.result.current.positionRef.current).toBe(1000));
    const release = holdNext();
    let change!: Promise<unknown>;
    act(() => {
      change = view.result.current.setPlaybackOptions({ tempoMultiplier: 0.5, playRepeats: true });
    });
    let play!: Promise<void>;
    act(() => {
      play = view.result.current.togglePlayPause();
    });
    expect(score.synthAudioBatch).not.toHaveBeenCalled();
    await act(async () => {
      release();
      await change;
      await play;
    });
    expect(startTimes(score)).toEqual([2]);
  });

  it('moves an idle playhead without rendering audio', async () => {
    const { score } = optionsScore();
    const view = mount(score);
    act(() => {
      view.result.current.seek(1000);
    });
    await waitFor(() => expect(view.result.current.positionRef.current).toBe(1000));
    await act(async () => {
      await view.result.current.setPlaybackOptions({ tempoMultiplier: 0.5, playRepeats: true });
    });
    expect(view.result.current.positionRef.current).toBe(2000);
    expect(view.result.current.state).toBe('idle');
    expect(score.synthAudioBatch).not.toHaveBeenCalled();
  });

  it('regenerates compatibility audio under the new options instead of reusing the old WAV', async () => {
    const { score } = optionsScore({ synthAudioBatch: undefined });
    vi.mocked(score).saveAudio = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const view = mount(score);
    view.audio.context.decodeAudioData = vi.fn(
      async () => ({ duration: 8 }) as AudioBuffer,
    ) as unknown as AudioContext['decodeAudioData'];
    await act(async () => {
      await view.result.current.togglePlayPause();
    });
    expect(score.saveAudio).toHaveBeenCalledOnce();
    await act(async () => {
      await view.result.current.setPlaybackOptions({ tempoMultiplier: 0.5, playRepeats: true });
    });
    await waitFor(() => expect(score.saveAudio).toHaveBeenCalledTimes(2));
    expect(view.result.current.state).toBe('playing');
  });

  it('leaves playback untouched on engines without options', async () => {
    const { score } = optionsScore({ setPlaybackOptions: undefined });
    const view = mount(score);
    await playTo(view, 1);
    let change: Awaited<ReturnType<typeof view.result.current.setPlaybackOptions>>;
    await act(async () => {
      change = await view.result.current.setPlaybackOptions({
        tempoMultiplier: 0.5,
        playRepeats: true,
      });
    });
    expect(change!.status).toBe('unavailable');
    expect(view.audio.sources.every((source) => !source.stopped)).toBe(true);
    expect(startTimes(score)).toEqual([0]);
  });

  it('seeks a selection play by restarting a full stream at the target, without a count-in', async () => {
    const { score } = optionsScore();
    const view = mount(score, { enabled: true, countIn: true });
    const selection = vi.fn(async () => music(1.5));
    await act(async () => {
      await view.result.current.start({ createIterator: selection });
    });
    await waitFor(() => expect(selection).toHaveBeenCalledOnce());
    await waitFor(() => expect(view.result.current.state).toBe('playing'));
    const before = view.audio.sources.length;
    act(() => {
      view.result.current.seek(3000);
    });
    await waitFor(() => expect(startTimes(score)).toEqual([3]));
    expect(selection).toHaveBeenCalledOnce();
    const music3 = () =>
      view.audio.sources.slice(before).filter((source) => source.buffer?.frames !== 1_323);
    await waitFor(() => expect(music3().length).toBeGreaterThan(0));
    expect(music3()[0].startedAt! - view.audio.context.currentTime).toBeLessThan(0.5);
  });

  it('resumes at the same place under the options the engine still holds when a change fails', async () => {
    const { score, failOnce } = optionsScore();
    const view = mount(score);
    await playTo(view, 1);
    failOnce();
    let change: Awaited<ReturnType<typeof view.result.current.setPlaybackOptions>>;
    await act(async () => {
      change = await view.result.current.setPlaybackOptions({
        tempoMultiplier: 0.5,
        playRepeats: true,
      });
    });
    expect(change!).toMatchObject({
      status: 'failed',
      accepted: { tempoMultiplier: 1, revision: 0 },
    });
    expect(change!.toMs).toBeCloseTo(1000, 6);
    await waitFor(() => expect(startTimes(score)).toHaveLength(2));
    expect(startTimes(score)[1]).toBeCloseTo(1, 9);
    expect(view.result.current.state).not.toBe('idle');
    // A later request still applies normally.
    await act(async () => {
      await view.result.current.setPlaybackOptions({ tempoMultiplier: 0.5, playRepeats: true });
    });
    expect(view.result.current.playbackOptions).toMatchObject({ tempoMultiplier: 0.5 });
  });
});
