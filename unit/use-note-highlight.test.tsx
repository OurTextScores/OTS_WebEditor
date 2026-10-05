// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  initialHighlightMode,
  useHighlightView,
  useNoteHighlight,
} from '../components/score-player/useNoteHighlight';
import type { Positions, Score } from '../lib/webmscore-loader';

afterEach(() => window.localStorage.clear());

const box = (id: number, page = 0) => ({
  id,
  page,
  x: id * 100,
  y: 0,
  sx: 80,
  sy: 40,
  width: 80,
  height: 40,
});
const positions = (count: number): Positions =>
  ({
    elements: Array.from({ length: count }, (_, i) => box(i)),
    events: Array.from({ length: count }, (_, i) => ({ elid: i, position: i * 500 })),
  }) as unknown as Positions;
const scoreWith = (segmentPositions: () => Promise<Positions>) =>
  ({ segmentPositions }) as unknown as Score;

function setup(score: Score | null, initial: 'measure' | 'note' = 'measure') {
  const scoreRef = { current: score };
  return { scoreRef, ...renderHook(() => useNoteHighlight(scoreRef, initial)) };
}

describe('initialHighlightMode', () => {
  it('prefers the URL, then the remembered choice, then measures', () => {
    expect(initialHighlightMode(null)).toBe('measure');
    window.localStorage.setItem('ots-player-highlight', 'note');
    expect(initialHighlightMode(null)).toBe('note');
    expect(initialHighlightMode('measure')).toBe('measure');
    window.localStorage.setItem('ots-player-highlight', 'measure');
    expect(initialHighlightMode('note')).toBe('note');
  });
});

describe('useNoteHighlight', () => {
  it('fetches the positions only when note mode is asked for, and remembers the choice', async () => {
    const segmentPositions = vi.fn(async () => positions(3));
    const { result } = setup(scoreWith(segmentPositions));
    expect(segmentPositions).not.toHaveBeenCalled();
    act(() => result.current.toggle());
    await waitFor(() => expect(result.current.segments).not.toBeNull());
    expect(result.current.mode).toBe('note');
    expect(segmentPositions).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('ots-player-highlight')).toBe('note');
    act(() => result.current.toggle());
    expect(result.current.mode).toBe('measure');
    act(() => result.current.toggle());
    expect(result.current.mode).toBe('note');
    expect(segmentPositions).toHaveBeenCalledTimes(1);
  });

  it('falls back to measures with a message when the engine fails or has nothing', async () => {
    const failing = setup(
      scoreWith(async () => {
        throw new Error('function signature mismatch');
      }),
    );
    act(() => failing.result.current.toggle());
    await waitFor(() => expect(failing.result.current.mode).toBe('measure'));
    expect(failing.result.current.message).toMatch(/unavailable/);
    act(() => failing.result.current.dismissMessage());
    expect(failing.result.current.message).toBe('');

    const empty = setup(
      scoreWith(async () => ({ elements: [], events: [] }) as unknown as Positions),
    );
    act(() => empty.result.current.toggle());
    await waitFor(() => expect(empty.result.current.mode).toBe('measure'));
    expect(empty.result.current.message).toMatch(/unavailable/);
  });

  it('reads one at a time, and ignores a score that was replaced while it read', async () => {
    let release: (value: Positions) => void = () => {};
    const segmentPositions = vi.fn(
      () =>
        new Promise<Positions>((resolve) => {
          release = resolve;
        }),
    );
    const { result, scoreRef } = setup(scoreWith(segmentPositions));
    const target = scoreRef.current!;
    let first: Promise<boolean> = Promise.resolve(false);
    let second: Promise<boolean> = Promise.resolve(true);
    act(() => {
      first = result.current.fetchSegments(target);
      second = result.current.fetchSegments(target);
    });
    expect(await second).toBe(false);
    scoreRef.current = scoreWith(async () => positions(1));
    await act(async () => {
      release(positions(3));
      await first;
    });
    expect(result.current.segments).toBeNull();
  });

  it('applies the positions of a score loaded in note mode, and falls back when they are unusable', () => {
    const { result } = setup(null, 'note');
    act(() => result.current.applyLoaded(positions(2)));
    expect(result.current.segments?.elements).toHaveLength(2);
    expect(result.current.mode).toBe('note');
    act(() => result.current.applyLoaded(null));
    expect(result.current.mode).toBe('measure');
    expect(result.current.message).toMatch(/unavailable/);
    act(() => result.current.reset());
    expect(result.current.segments).toBeNull();
    expect(result.current.message).toBe('');
  });
});

describe('useHighlightView', () => {
  const measure = box(9);
  const view = (mode: 'measure' | 'note', positionMs: number, segments: Positions | null) =>
    renderHook(() =>
      useHighlightView({ mode, segments, positionMs, currentPage: 0, activeMeasure: measure }),
    ).result.current;

  it('highlights and follows the sounding note in note mode, else the measure', () => {
    const noted = view('note', 1100, positions(4));
    expect(noted.highlightBox?.id).toBe(2);
    expect(noted.followTarget?.id).toBe(2);
    expect(noted.highlightIsNote).toBe(true);
    expect(noted.visibleNotes).toHaveLength(4);
    const measured = view('measure', 1100, positions(4));
    expect(measured.highlightBox).toBe(measure);
    expect(measured.highlightIsNote).toBe(false);
  });

  it('keeps the measure while the notes are still loading or unavailable', () => {
    const waiting = view('note', 1100, null);
    expect(waiting.highlightBox).toBe(measure);
    expect(waiting.followTarget).toBe(measure);
    expect(waiting.highlightIsNote).toBe(false);
  });
});
