import { act, renderHook, waitFor } from '@testing-library/react';
import { createRef, useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Score, SynthAudioBatchIterator } from '../lib/webmscore-loader';
import { useCompareOperationCoordinator } from '../components/score-editor/compare/useCompareOperationCoordinator';
import {
  useCompareTransport,
  type CompareStreamTarget,
} from '../components/score-editor/compare/useCompareTransport';
import type { CompareSide } from '../components/score-editor/compare/compare-types';

const deferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const makeScore = () => {
  const iterator = vi.fn(async () => undefined) as unknown as SynthAudioBatchIterator;
  const synthAudioBatch = vi.fn(async () => iterator);
  const synthAudioBatchForMeasureRange = vi.fn(async () => iterator);
  const score = { synthAudioBatch, synthAudioBatchForMeasureRange } as unknown as Score;
  return { iterator, score, synthAudioBatch, synthAudioBatchForMeasureRange };
};

const renderTransport = (
  // `middle` is the scanner comparator's merged pane; a two-pane transport
  // simply has no score there.
  scores: { left: Score | null; middle: Score | null; right: Score | null },
  ensureSoundFontLoaded: (score: Score, options: { forceRetry: boolean }) => Promise<boolean>,
) => {
  const audioContextRef = createRef<AudioContext | null>();
  audioContextRef.current = null;
  const stopMainAudio = vi.fn(async () => {});
  const stopStream = vi.fn(async () => {});
  const playStream = vi.fn(
    async (_iterator: SynthAudioBatchIterator, target: CompareStreamTarget) => {
      target.setIsPlaying(true);
      target.setIsPaused(false);
    },
  );
  const reportUnavailable = vi.fn();
  const reportMissingSoundFont = vi.fn();
  const reportPlaybackError = vi.fn<(side: CompareSide, error: unknown) => void>();
  const reportRangedSynthUnavailable = vi.fn<(error: unknown) => void>();
  const dependencies = {
    audioContextRef,
    batchSize: 2,
    ensureSoundFontLoaded,
    stopMainAudio,
    stopStream,
    playStream,
    reportUnavailable,
    reportMissingSoundFont,
    reportPlaybackError,
    reportRangedSynthUnavailable,
  };
  const hook = renderHook(
    ({ nextScores }) => useCompareTransport({ scores: nextScores, ...dependencies }),
    { initialProps: { nextScores: scores } },
  );
  return { ...hook, ...dependencies };
};

describe('useCompareTransport', () => {
  it('does not start hidden audio when stopped during soundfont setup', async () => {
    const soundFont = deferred<boolean>();
    const left = makeScore();
    const transport = renderTransport(
      { left: left.score, middle: null, right: null },
      vi.fn(() => soundFont.promise),
    );

    let play!: Promise<void>;
    await act(async () => {
      play = transport.result.current.playSideAudio('left');
      await Promise.resolve();
    });
    await act(async () => transport.result.current.stopSideAudio('left', { awaitCancel: true }));
    soundFont.resolve(true);
    await act(async () => play);

    expect(left.synthAudioBatch).not.toHaveBeenCalled();
    expect(transport.playStream).not.toHaveBeenCalled();
    expect(transport.result.current.left.isPlaying).toBe(false);
    expect(transport.result.current.left.isBusy).toBe(false);
  });

  it('invalidates setup when the displayed score identity changes', async () => {
    const soundFont = deferred<boolean>();
    const original = makeScore();
    const replacement = makeScore();
    const transport = renderTransport(
      { left: original.score, middle: null, right: null },
      vi.fn(() => soundFont.promise),
    );

    let play!: Promise<void>;
    await act(async () => {
      play = transport.result.current.playSideAudio('left');
      await Promise.resolve();
    });
    transport.rerender({ nextScores: { left: replacement.score, middle: null, right: null } });
    await waitFor(() => expect(transport.stopStream).toHaveBeenCalledOnce());
    soundFont.resolve(true);
    await act(async () => play);

    expect(original.synthAudioBatch).not.toHaveBeenCalled();
    expect(replacement.synthAudioBatch).not.toHaveBeenCalled();
    expect(transport.playStream).not.toHaveBeenCalled();
  });

  it('keeps a superseded attempt from clearing the busy flag a newer one owns', async () => {
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    const soundFonts = [first.promise, second.promise];
    const left = makeScore();
    const transport = renderTransport(
      { left: left.score, middle: null, right: null },
      vi.fn(() => soundFonts.shift() ?? Promise.resolve(true)),
    );

    let superseded!: Promise<void>;
    await act(async () => {
      superseded = transport.result.current.playSideAudio('left');
      await Promise.resolve();
    });
    await act(async () => {
      void transport.result.current.playSideAudio('left');
      await Promise.resolve();
    });

    first.resolve(true);
    await act(async () => superseded);

    // The newer attempt is still loading its soundfont and still owns busy.
    expect(transport.playStream).not.toHaveBeenCalled();
    expect(transport.result.current.left.isBusy).toBe(true);

    second.resolve(true);
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(transport.result.current.left.isBusy).toBe(false));
  });

  it('drains a tracked cancellation before the coordinator destroys the score', async () => {
    const cancel = deferred<void>();
    const auxiliary = makeScore();
    const destroy = vi.fn();
    const auxiliaryScore = Object.assign(auxiliary.score, { destroy }) as Score;
    const stopStream = vi.fn(() => cancel.promise);

    const { result } = renderHook(() => {
      const auxiliaryScoreRef = useRef<Score | null>(auxiliaryScore);
      const coordinator = useCompareOperationCoordinator({
        auxiliaryScoreRef,
        runSerializedScoreOperation: (operation) => operation(),
      });
      const audioContextRef = useRef<AudioContext | null>(null);
      const transport = useCompareTransport({
        scores: { left: null, middle: null, right: auxiliaryScore },
        audioContextRef,
        batchSize: 2,
        ensureSoundFontLoaded: async () => true,
        stopMainAudio: async () => {},
        stopStream,
        playStream: async () => {},
        reportUnavailable: () => {},
        reportMissingSoundFont: () => {},
        reportPlaybackError: () => {},
        trackOperation: coordinator.trackOperation,
      });
      return { coordinator, transport };
    });

    let teardown!: Promise<void>;
    await act(async () => {
      void result.current.transport.stopSideAudio('right', { awaitCancel: true });
      teardown = result.current.coordinator.queueScoreTeardown(
        auxiliaryScore,
        null,
        'compare-close',
      );
      await Promise.resolve();
    });

    expect(stopStream).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      awaitCancel: true,
    });
    expect(destroy).not.toHaveBeenCalled();

    cancel.resolve();
    await act(async () => teardown);

    expect(destroy).toHaveBeenCalledOnce();
  });

  it('leaves exactly one transport playing, whichever pane it is', async () => {
    // The scanner comparator has three panes, so "stop the other side" is no
    // longer well defined — comparing by ear means hearing one reading at a
    // time, and two at once is noise rather than a comparison.
    const left = makeScore();
    const middle = makeScore();
    const right = makeScore();
    const transport = renderTransport(
      { left: left.score, middle: middle.score, right: right.score },
      vi.fn(async () => true),
    );

    await act(async () => transport.result.current.playSideAudio('left'));
    expect(transport.result.current.left.isPlaying).toBe(true);

    await act(async () => transport.result.current.playSideAudio('middle'));
    expect(transport.result.current.left.isPlaying).toBe(false);
    expect(transport.result.current.middle.isPlaying).toBe(true);
    expect(transport.result.current.right.isPlaying).toBe(false);

    await act(async () => transport.result.current.playSideAudio('right'));
    expect(transport.result.current.left.isPlaying).toBe(false);
    expect(transport.result.current.middle.isPlaying).toBe(false);
    expect(transport.result.current.right.isPlaying).toBe(true);

    // The editor's own playback is stopped on every attempt, not just the first.
    expect(transport.stopMainAudio).toHaveBeenCalledTimes(3);
  });

  it('plays only the row the reviewer asked about', async () => {
    // The scanner's rows are systems of a scanned page. A play button on
    // system 7 that started from bar one would answer a question nobody
    // asked.
    const left = makeScore();
    const transport = renderTransport(
      { left: left.score, middle: null, right: null },
      vi.fn(async () => true),
    );

    await act(async () =>
      transport.result.current.playSideAudio('left', {
        startMeasureIndex: 12,
        endMeasureIndex: 15,
      }),
    );

    expect(left.synthAudioBatchForMeasureRange).toHaveBeenCalledWith(12, 15, expect.any(Number));
    expect(left.synthAudioBatch).not.toHaveBeenCalled();
  });

  it('plays the whole score when the build has no ranged synth', async () => {
    // The worker proxy forwards any method name, so the capability check
    // always passes and only the call finds out: a build without
    // `synthAudioForMeasureRange` reaches `undefined.apply` inside the
    // worker. Every row's play button reported "unable to play audio"
    // rather than playing anything.
    const left = makeScore();
    left.synthAudioBatchForMeasureRange.mockRejectedValue(
      new TypeError("Cannot read properties of undefined (reading 'apply')"),
    );
    const transport = renderTransport(
      { left: left.score, middle: null, right: null },
      vi.fn(async () => true),
    );

    await act(async () =>
      transport.result.current.playSideAudio('left', {
        startMeasureIndex: 12,
        endMeasureIndex: 15,
      }),
    );

    expect(left.synthAudioBatch).toHaveBeenCalledWith(0, expect.any(Number));
    expect(transport.reportRangedSynthUnavailable).toHaveBeenCalledTimes(1);
    expect(transport.reportUnavailable).not.toHaveBeenCalled();

    // Learned once: the failing call is not repeated on the next row.
    left.synthAudioBatchForMeasureRange.mockClear();
    await act(async () =>
      transport.result.current.playSideAudio('left', {
        startMeasureIndex: 20,
        endMeasureIndex: 21,
      }),
    );
    expect(left.synthAudioBatchForMeasureRange).not.toHaveBeenCalled();
    expect(transport.reportRangedSynthUnavailable).toHaveBeenCalledTimes(1);
  });

  it('falls back to the whole score when no row is named', async () => {
    const left = makeScore();
    const transport = renderTransport(
      { left: left.score, middle: null, right: null },
      vi.fn(async () => true),
    );

    await act(async () => transport.result.current.playSideAudio('left'));

    expect(left.synthAudioBatch).toHaveBeenCalledWith(0, expect.any(Number));
    expect(left.synthAudioBatchForMeasureRange).not.toHaveBeenCalled();
  });
});
