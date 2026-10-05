// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useUndoHistory } from '../../components/score-editor/useUndoHistory';
import type { Score, UndoEntryInfo, UndoInfo } from '../../lib/webmscore-loader';

/** A score whose undo stack the test moves by hand. */
function fakeScore(initial: UndoInfo = { index: 0, size: 0, clean: true }) {
  let info = initial;
  let entries: UndoEntryInfo[] = [];
  const score = {
    getUndoInfo: vi.fn(async () => info),
    getUndoEntries: vi.fn(async (from: number, to: number) => entries.slice(from, to)),
  } as unknown as Score;
  return {
    score,
    set(next: UndoInfo, nextEntries: UndoEntryInfo[] = entries) {
      info = next;
      entries = nextEntries;
    },
  };
}

describe('useUndoHistory', () => {
  it('stays unknown for an engine without the undo exports', async () => {
    const { result } = renderHook(() => useUndoHistory({} as Score));
    await act(async () => {
      await result.current.refresh('addDynamic');
    });
    expect(result.current.history.known).toBe(false);
  });

  it('reads the stack when a score appears, then follows edits, undo and a jump', async () => {
    const fake = fakeScore();
    const { result } = renderHook(() => useUndoHistory(fake.score));
    await waitFor(() => expect(result.current.history.known).toBe(true));
    expect(result.current.history).toMatchObject({ index: 0, entries: [], clean: true });

    fake.set({ index: 1, size: 1, clean: false });
    await act(async () => {
      await result.current.refresh('addDynamic');
    });
    fake.set({ index: 2, size: 2, clean: false });
    await act(async () => {
      await result.current.refresh('pitchUp');
    });
    expect(result.current.history.entries.map((e) => e.description)).toEqual([
      'Add dynamic',
      'Raise pitch',
    ]);
    expect(result.current.history.index).toBe(2);

    fake.set({ index: 0, size: 2, clean: true });
    await act(async () => {
      await result.current.refresh('undo to');
    });
    expect(result.current.history).toMatchObject({ index: 0, clean: true });
    expect(result.current.history.entries).toHaveLength(2);
  });

  it('describes every entry from the engine when its size disagrees with what the editor saw', async () => {
    const fake = fakeScore();
    const { result } = renderHook(() => useUndoHistory(fake.score));
    await waitFor(() => expect(result.current.history.known).toBe(true));
    fake.set({ index: 2, size: 2, clean: false }, [
      { commands: ['ChangePitch'], elements: ['Note'], tickStart: 0, tickEnd: 0 },
      { commands: ['Add:    <Slur> 0x1'], elements: ['Slur'], tickStart: 0, tickEnd: 0 },
    ]);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.history.entries.map((e) => e.description)).toEqual([
      'Change pitch',
      'Add slur',
    ]);
  });

  it('serves quick refreshes in order, and a refresh in flight counts as busy', async () => {
    const fake = fakeScore();
    const { result } = renderHook(() => useUndoHistory(fake.score));
    await waitFor(() => expect(result.current.history.known).toBe(true));
    fake.set({ index: 1, size: 1, clean: false });
    await act(async () => {
      const first = result.current.refresh('addDynamic');
      fake.set({ index: 2, size: 2, clean: false });
      const second = result.current.refresh('addSlur');
      await Promise.all([first, second]);
    });
    expect(result.current.refreshing).toBe(false);
    expect(result.current.history.index).toBe(2);
    expect(result.current.history.entries).toHaveLength(2);
  });

  it('starts over for a new score and survives the engine failing', async () => {
    const first = fakeScore({ index: 0, size: 0, clean: true });
    const { result, rerender } = renderHook(({ score }) => useUndoHistory(score), {
      initialProps: { score: first.score },
    });
    await waitFor(() => expect(result.current.history.known).toBe(true));
    first.set({ index: 1, size: 1, clean: false });
    await act(async () => {
      await result.current.refresh('addDynamic');
    });
    expect(result.current.history.entries).toHaveLength(1);

    const second = fakeScore({ index: 0, size: 0, clean: true });
    rerender({ score: second.score });
    await waitFor(() => expect(result.current.history.entries).toHaveLength(0));
    await waitFor(() => expect(result.current.history.known).toBe(true));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (second.score.getUndoInfo as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    await act(async () => {
      await result.current.refresh('addDynamic');
    });
    expect(warn).toHaveBeenCalled();
    expect(result.current.history.known).toBe(true);
    warn.mockRestore();
  });
});

describe('useUndoHistory.touch', () => {
  it('reads the stack shortly after an interaction, and Undo counts as available until it has', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fake = fakeScore();
      const { result } = renderHook(() => useUndoHistory(fake.score));
      await vi.waitFor(() => expect(result.current.history.known).toBe(true));
      fake.set({ index: 1, size: 1, clean: false }, [
        { commands: ['Add:    <Slur> 0x1'], elements: ['Slur'], tickStart: 0, tickEnd: 0 },
      ]);
      act(() => result.current.touch());
      act(() => result.current.touch());
      expect(result.current.refreshing).toBe(true);
      expect(result.current.history.index).toBe(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      await vi.waitFor(() => expect(result.current.history.index).toBe(1));
      expect(result.current.history.entries.map((e) => e.description)).toEqual(['Add slur']);
      expect(result.current.refreshing).toBe(false);
      // One burst, one read.
      expect(fake.score.getUndoInfo as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays busy until the pending read is done, even when another refresh finishes first', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fake = fakeScore();
      const { result } = renderHook(() => useUndoHistory(fake.score));
      await vi.waitFor(() => expect(result.current.history.known).toBe(true));
      act(() => result.current.touch());
      await act(async () => {
        await result.current.refresh('addDynamic');
      });
      expect(result.current.refreshing).toBe(true);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      await vi.waitFor(() => expect(result.current.refreshing).toBe(false));
    } finally {
      vi.useRealTimers();
    }
  });
});
