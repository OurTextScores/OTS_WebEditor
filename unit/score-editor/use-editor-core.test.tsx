// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useEditorCore,
  type EditorCoreContext,
} from '../../components/score-editor/core/useEditorCore';
import { ENGINE_OPERATION_STALL_RELEASE_MS } from '../../components/score-editor/layout-constants';
import {
  getAnnouncement,
  resetAnnouncements,
} from '../../components/shell/announcer/announcerStore';
import type { Score } from '../../lib/webmscore-loader';

const notices = vi.hoisted(() => ({ notify: vi.fn(), notifyError: vi.fn() }));
vi.mock('../../components/shell/notices', () => notices);

type FakeScore = Record<string, ReturnType<typeof vi.fn>>;
const fakeScore = (over: FakeScore = {}) =>
  ({
    relayout: vi.fn(async () => undefined),
    selectElementAtPoint: vi.fn(async () => true),
    selectTextElementAtPoint: vi.fn(async () => true),
    isSelectionRange: vi.fn(async () => false),
    ...over,
  }) as FakeScore & Score;

function setup(
  over: {
    late?: Partial<EditorCoreContext['lateInputs']['current']>;
    score?: FakeScore | null;
  } = {},
) {
  const ctx = {
    refreshPageCount: vi.fn(async () => 3),
    renderScore: vi.fn(async () => true),
    lateInputs: {
      current: {
        interactiveMutationEnabled: true,
        playSelectionPreview: vi.fn(async () => undefined),
        refreshNoteInputCursor: vi.fn(async () => null),
        ...over.late,
      },
    },
  } as unknown as EditorCoreContext & {
    refreshPageCount: ReturnType<typeof vi.fn>;
    renderScore: ReturnType<typeof vi.fn>;
    lateInputs: {
      current: {
        playSelectionPreview: ReturnType<typeof vi.fn>;
        refreshNoteInputCursor: ReturnType<typeof vi.fn>;
      };
    };
  };
  const hook = renderHook(() => useEditorCore(ctx));
  const score = over.score === undefined ? fakeScore() : over.score;
  if (score) act(() => hook.result.current.setScore(score as unknown as Score));
  return { ctx, score, ...hook };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAnnouncements();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => (callback(0), 0));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('performMutation: when it does nothing', () => {
  it('needs a score, an action, and an editor that is ready for edits', async () => {
    const noScore = setup({ score: null });
    const action = vi.fn();
    await act(async () => noScore.result.current.performMutation('raise pitch', action));
    expect(action).not.toHaveBeenCalled();

    const notReady = setup({ late: { interactiveMutationEnabled: false } });
    await act(async () => notReady.result.current.performMutation('raise pitch', action));
    expect(action).not.toHaveBeenCalled();

    const noAction = setup();
    await act(async () => noAction.result.current.performMutation('raise pitch'));
    expect(noAction.ctx.renderScore).not.toHaveBeenCalled();
  });

  it('stops after an action that changed nothing', async () => {
    const { result, ctx } = setup();
    await act(async () => result.current.performMutation('nudge', () => false));
    expect(ctx.renderScore).not.toHaveBeenCalled();
    expect(result.current.scoreDirtySinceCheckpoint).toBe(false);
    expect(getAnnouncement().text).toBe('');
  });
});

describe('performMutation: a successful edit', () => {
  it('runs the action, relayouts, renders the refreshed page, marks the score dirty and announces it', async () => {
    const { result, ctx, score } = setup();
    const action = vi.fn(async () => true);
    await act(async () => result.current.performMutation('raise pitch', action));
    expect(action).toHaveBeenCalledTimes(1);
    expect(score.relayout).toHaveBeenCalledTimes(1);
    expect(ctx.refreshPageCount).toHaveBeenCalledWith(score, 0);
    expect(ctx.renderScore).toHaveBeenCalledWith(score, 3, true, expect.anything());
    expect(result.current.scoreDirtySinceCheckpoint).toBe(true);
    expect(result.current.scoreDirtySinceXml).toBe(true);
    expect(getAnnouncement().text).toBe('Raise pitch.');
  });

  it('does the steps in order: action, relayout, page count, render', async () => {
    const { result, ctx, score } = setup();
    const order: string[] = [];
    score.relayout.mockImplementation(async () => void order.push('relayout'));
    ctx.refreshPageCount.mockImplementation(async () => (order.push('pageCount'), 2));
    ctx.renderScore.mockImplementation(async () => (order.push('render'), true));
    await act(async () =>
      result.current.performMutation('x', async () => (order.push('action'), true)),
    );
    expect(order).toEqual(['action', 'relayout', 'pageCount', 'render']);
  });

  it('skips the full relayout when asked to, or when the edit is known to lay out incrementally', async () => {
    const { result, score } = setup();
    await act(async () => result.current.performMutation('a', () => true, { skipRelayout: true }));
    await act(async () =>
      result.current.performMutation('b', () => true, { incrementalLayout: true }),
    );
    expect(score.relayout).not.toHaveBeenCalled();
    await act(async () => result.current.performMutation('c', () => true));
    expect(score.relayout).toHaveBeenCalledTimes(1);
  });

  it('carries on when the relayout fails', async () => {
    const { result, ctx, score } = setup();
    score.relayout.mockRejectedValue(new Error('layout broke'));
    await act(async () => result.current.performMutation('x', () => true));
    expect(ctx.renderScore).toHaveBeenCalled();
    expect(notices.notify).not.toHaveBeenCalled();
  });

  it('treats anything but false as a change, including no return value', async () => {
    const { result, ctx } = setup();
    await act(async () => result.current.performMutation('x', () => undefined));
    expect(ctx.renderScore).toHaveBeenCalledTimes(1);
  });

  it('refreshes the note input cursor only while note input is on', async () => {
    const { result, ctx } = setup();
    await act(async () => result.current.performMutation('x', () => true));
    expect(ctx.lateInputs.current.refreshNoteInputCursor).not.toHaveBeenCalled();
    result.current.noteInputActiveRef.current = true;
    await act(async () => result.current.performMutation('x', () => true));
    expect(ctx.lateInputs.current.refreshNoteInputCursor).toHaveBeenCalledTimes(1);
  });

  it('shows a notice and renders nothing when the action throws', async () => {
    const { result, ctx } = setup();
    await act(async () =>
      result.current.performMutation('add slur', () => {
        throw new Error('boom');
      }),
    );
    expect(notices.notify).toHaveBeenCalledWith({
      kind: 'error',
      title: 'Unable to add slur',
      detail: 'See the console.',
    });
    expect(ctx.renderScore).not.toHaveBeenCalled();
    expect(result.current.scoreDirtySinceCheckpoint).toBe(false);
  });
});

describe('performMutation: selection', () => {
  const select = (hook: ReturnType<typeof setup>['result'], boxes = 1) =>
    act(() => {
      hook.current.setSelectedPoint({ page: 1, x: 10, y: 20 });
      hook.current.setSelectedIndex(4);
      hook.current.setSelectedElement({ x: 1, y: 2, w: 3, h: 4 });
      hook.current.setSelectedElementClasses('Note');
      hook.current.setSelectionBoxes(
        Array.from({ length: boxes }, (_, index) => ({ index }) as never),
      );
    });

  it('selects the same point again in the engine after the edit', async () => {
    const { result, score } = setup();
    select(result);
    await act(async () => result.current.performMutation('x', () => true));
    expect(score.selectElementAtPoint).toHaveBeenCalledWith(1, 10, 20);
    expect(result.current.selectedPoint).toEqual({ page: 1, x: 10, y: 20 });
    expect(result.current.selectedIndex).toBe(4);
  });

  it('leaves the engine selection alone when told to, for a multi-selection, and for a range', async () => {
    const skip = setup();
    select(skip.result);
    await act(async () =>
      skip.result.current.performMutation('x', () => true, { skipWasmReselect: true }),
    );
    expect(skip.score.selectElementAtPoint).not.toHaveBeenCalled();

    const multi = setup();
    select(multi.result, 3);
    await act(async () => multi.result.current.performMutation('x', () => true));
    expect(multi.score.selectElementAtPoint).not.toHaveBeenCalled();

    const range = setup({ score: fakeScore({ isSelectionRange: vi.fn(async () => true) }) });
    select(range.result);
    await act(async () => range.result.current.performMutation('x', () => true));
    expect(range.score.selectElementAtPoint).not.toHaveBeenCalled();
  });

  it('clears the selection when asked, even if the edit changed nothing', async () => {
    const { result, score } = setup();
    select(result);
    await act(async () =>
      result.current.performMutation('delete', () => false, { clearSelection: true }),
    );
    expect(result.current.selectedPoint).toBeNull();
    expect(result.current.selectedIndex).toBeNull();
    expect(result.current.selectedElement).toBeNull();
    expect(result.current.selectionBoxes).toEqual([]);
    expect(result.current.selectedElementClasses).toBe('');
    expect(result.current.overlaySuppressed).toBe(true);
    expect(score.relayout).not.toHaveBeenCalled();
  });

  it('clears the selection after a successful clearing edit; the engine selection is only left alone with skipWasmReselect', async () => {
    const { result, score } = setup();
    select(result);
    await act(async () =>
      result.current.performMutation('delete', () => true, {
        clearSelection: true,
        skipWasmReselect: true,
      }),
    );
    expect(result.current.selectedPoint).toBeNull();
    expect(score.selectElementAtPoint).not.toHaveBeenCalled();
    expect(result.current.scoreDirtySinceCheckpoint).toBe(true);

    // Characterisation: without skipWasmReselect the point is selected again in the engine even
    // though the UI selection was cleared. The edits that clear the selection pass skipWasmReselect.
    select(result);
    await act(async () =>
      result.current.performMutation('delete', () => true, { clearSelection: true }),
    );
    expect(score.selectElementAtPoint).toHaveBeenCalledWith(1, 10, 20);
  });

  it('can play the result, without re-selecting while notes are being entered', async () => {
    const { result, ctx } = setup();
    select(result);
    await act(async () =>
      result.current.performMutation('raise pitch', () => true, { playSelectionPreview: true }),
    );
    expect(ctx.lateInputs.current.playSelectionPreview).toHaveBeenCalledWith(
      'mutation:raise pitch',
      { page: 1, x: 10, y: 20 },
      { reselect: true },
    );
    result.current.noteInputActiveRef.current = true;
    await act(async () =>
      result.current.performMutation('add', () => true, { playSelectionPreview: true }),
    );
    expect(ctx.lateInputs.current.playSelectionPreview).toHaveBeenLastCalledWith(
      'mutation:add',
      { page: 1, x: 10, y: 20 },
      { reselect: false },
    );
  });
});

describe('requireMutation', () => {
  it('returns a function that calls the engine method with the score as its receiver', async () => {
    const calls: unknown[] = [];
    const score = fakeScore();
    (score as unknown as Record<string, unknown>).setDynamic = function (
      this: unknown,
      ...args: unknown[]
    ) {
      calls.push([this === score, ...args]);
      return true;
    };
    const { result } = setup({ score });
    const call = result.current.requireMutation('setDynamic' as never)!;
    expect(call('p', 3)).toBe(true);
    expect(calls).toEqual([[true, 'p', 3]]);
  });

  it('says so, and returns null, when the build lacks the method', () => {
    const { result } = setup();
    expect(result.current.requireMutation('pitchUp' as never)).toBeNull();
    expect(notices.notifyError).toHaveBeenCalledWith(
      'This build of webmscore does not expose "pitchUp".',
    );
  });
});

describe('runSerializedScoreOperation', () => {
  it('runs operations one at a time, in the order they were asked for', async () => {
    const { result } = setup();
    const log: string[] = [];
    let releaseFirst: () => void = () => {};
    const first = result.current.runSerializedScoreOperation(
      () =>
        new Promise<string>((resolve) => {
          log.push('first start');
          releaseFirst = () => {
            log.push('first end');
            resolve('1');
          };
        }),
      'first',
    );
    const second = result.current.runSerializedScoreOperation(
      async () => (log.push('second'), '2'),
      'second',
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toEqual(['first start']);
    releaseFirst();
    expect(await Promise.all([first, second])).toEqual(['1', '2']);
    expect(log).toEqual(['first start', 'first end', 'second']);
  });

  it('keeps going after an operation fails', async () => {
    const { result } = setup();
    await expect(
      result.current.runSerializedScoreOperation(async () => {
        throw new Error('nope');
      }, 'bad'),
    ).rejects.toThrow('nope');
    await expect(
      result.current.runSerializedScoreOperation(async () => 'fine', 'good'),
    ).resolves.toBe('fine');
  });

  it('lets the next operation start if one stalls past the release time', async () => {
    vi.useFakeTimers();
    const { result } = setup();
    void result.current.runSerializedScoreOperation(() => new Promise<void>(() => {}), 'stuck');
    const next = result.current.runSerializedScoreOperation(async () => 'ran', 'next');
    await vi.advanceTimersByTimeAsync(ENGINE_OPERATION_STALL_RELEASE_MS + 1);
    await expect(next).resolves.toBe('ran');
  });
});

describe('ensureSelectionInWasm', () => {
  const withPoint = async (
    over: FakeScore = {},
    setupSelection?: (hook: ReturnType<typeof setup>['result']) => void,
  ) => {
    const hook = setup({ score: fakeScore(over) });
    act(() => {
      hook.result.current.setSelectedPoint({ page: 2, x: 5, y: 6 });
      setupSelection?.(hook.result);
    });
    await act(async () => hook.result.current.ensureSelectionInWasm());
    return hook;
  };

  it('selects the tracked point in the engine and clears the pending-projection flag', async () => {
    const { result, score } = await withPoint();
    result.current.selectionProjectionNeededRef.current = true;
    await act(async () => result.current.ensureSelectionInWasm());
    expect(score.selectElementAtPoint).toHaveBeenCalledWith(2, 5, 6);
    expect(result.current.selectionProjectionNeededRef.current).toBe(false);
  });

  it('uses the text selection for a text element', async () => {
    const { score } = await withPoint({}, (hook) =>
      hook.current.setSelectedElementClasses('Text Lyrics'),
    );
    expect(score.selectTextElementAtPoint).toHaveBeenCalledWith(2, 5, 6);
    expect(score.selectElementAtPoint).not.toHaveBeenCalled();
  });

  it('does nothing for a multi-selection, a range, or no tracked point', async () => {
    const multi = await withPoint({}, (hook) =>
      hook.current.setSelectionBoxes([{ index: 0 }, { index: 1 }] as never),
    );
    expect(multi.score.selectElementAtPoint).not.toHaveBeenCalled();
    const range = await withPoint({ isSelectionRange: vi.fn(async () => true) });
    expect(range.score.selectElementAtPoint).not.toHaveBeenCalled();
    const none = setup();
    await act(async () => none.result.current.ensureSelectionInWasm());
    expect(none.score.selectElementAtPoint).not.toHaveBeenCalled();
  });

  it('carries on when the engine rejects the selection', async () => {
    const { result } = await withPoint({
      selectElementAtPoint: vi.fn(async () => {
        throw new Error('x');
      }),
    });
    expect(result.current.score).toBeTruthy();
  });
});

describe('resolvePageIndex', () => {
  it('reads the page from a data-page attribute or a page-N id, and falls back to the current page', () => {
    const { result } = setup();
    const container = document.createElement('div');
    result.current.containerRef.current = container;
    const dataPage = document.createElement('div');
    dataPage.dataset.page = '4';
    const child = document.createElement('span');
    dataPage.appendChild(child);
    container.appendChild(dataPage);
    expect(result.current.resolvePageIndex(child)).toBe(4);

    const byId = document.createElement('div');
    byId.id = 'page-3';
    container.appendChild(byId);
    expect(result.current.resolvePageIndex(byId)).toBe(2);

    expect(result.current.resolvePageIndex(null)).toBe(0);
    result.current.currentPageRef.current = 7;
    expect(result.current.resolvePageIndex(document.createElement('p'))).toBe(7);
  });
});
