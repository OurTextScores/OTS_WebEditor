import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  routeCompareKeyboardShortcut,
  type CompareKeyboardShortcutContext,
} from '../components/score-editor/compare/compare-keyboard-policy';
import {
  useCompareEditing,
  useCompareMutationController,
  type CompareMutationControllerOptions,
} from '../components/score-editor/compare/useCompareEditing';
import type { Score } from '../lib/webmscore-loader';

type Box = { x: number };
type Cursor = { voice: number };

describe('useCompareEditing', () => {
  it('keeps selection and note input owned by score role', () => {
    const { result } = renderHook(() => useCompareEditing<Box, Cursor>());

    act(() => {
      result.current.setSelection('proposal', [{ x: 12 }]);
      result.current.requestNoteInput('proposal', true);
      result.current.commitNoteInput('proposal', true);
      result.current.setNoteInputCursor('proposal', { voice: 2 });
    });

    // Three roles: the scanner comparator's merged score is a document in
    // its own right, and its editing state must not be shared with either
    // engine reading.
    expect(result.current.state.selectionBoxesByRole).toEqual({
      current: [],
      merged: [],
      proposal: [{ x: 12 }],
    });
    expect(result.current.state.noteInputByRole).toEqual({
      current: false,
      merged: false,
      proposal: true,
    });
    expect(result.current.state.noteInputCursorByRole.proposal).toEqual({ voice: 2 });

    act(() => result.current.resetRole('proposal'));

    expect(result.current.state.hasSelectionByRole.proposal).toBe(false);
    expect(result.current.state.noteInputByRole.proposal).toBe(false);
    expect(result.current.state.noteInputCursorByRole.proposal).toBeNull();
    expect(result.current.state.noteInputByRole.current).toBe(false);
  });

  it('captures the first baseline and clears manual edits after undo to baseline', () => {
    const { result } = renderHook(() => useCompareEditing<Box, Cursor>());

    act(() => result.current.recordEdit('proposal', '<before/>', '<edit-1/>'));
    act(() => result.current.recordEdit('proposal', '<edit-1/>', '<edit-2/>'));

    expect(result.current.getBaseline('proposal')).toBe('<before/>');
    expect(result.current.state.editedRoles).toEqual(['proposal']);

    act(() => result.current.recordEdit('proposal', '<edit-2/>', '<before/>'));

    expect(result.current.getBaseline('proposal')).toBeNull();
    expect(result.current.state.editedRoles).toEqual([]);
  });

  it('restores a failed feedback cycle and clears a successful one', () => {
    const { result } = renderHook(() => useCompareEditing<Box, Cursor>());

    act(() => result.current.recordEdit('current', '<base/>', '<edited/>'));
    const snapshot = result.current.captureEditCycle();

    act(() => result.current.clearEditCycle());
    expect(result.current.state.editedRoles).toEqual([]);

    act(() => result.current.restoreEditCycle(snapshot));
    expect(result.current.state.editedRoles).toEqual(['current']);
    expect(result.current.getBaseline('current')).toBe('<base/>');

    act(() => result.current.clearEditCycle());
    expect(result.current.getBaseline('current')).toBeNull();
  });
});

const keyboardContext = (
  overrides: Partial<CompareKeyboardShortcutContext> = {},
): CompareKeyboardShortcutContext => ({
  active: true,
  activeRole: 'proposal',
  hasSelection: false,
  noteMode: false,
  mutate: vi.fn(),
  updateInputState: vi.fn(),
  copySelection: vi.fn(),
  pasteSelection: vi.fn(),
  disableNoteInput: vi.fn(),
  toggleNoteInput: vi.fn(),
  setHasSelection: vi.fn(),
  ...overrides,
});

describe('routeCompareKeyboardShortcut', () => {
  it('does not route anything without an explicitly active score role', () => {
    const context = keyboardContext({ active: false, activeRole: null });
    const event = new KeyboardEvent('keydown', { key: 'c', cancelable: true });

    expect(routeCompareKeyboardShortcut(event, context)).toBe(false);
    expect(context.mutate).not.toHaveBeenCalled();
  });

  it('routes pitch entry in note-input mode without a prior selection', () => {
    const context = keyboardContext({ noteMode: true });
    const event = new KeyboardEvent('keydown', { key: 'g', cancelable: true });

    expect(routeCompareKeyboardShortcut(event, context)).toBe(true);
    expect(context.mutate).toHaveBeenCalledWith('add a pitch', 'addPitchByStep', [4, false, false]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('routes clipboard shortcuts and role-owned selection state', () => {
    const context = keyboardContext({ hasSelection: true });

    routeCompareKeyboardShortcut(
      new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }),
      context,
    );
    routeCompareKeyboardShortcut(
      new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }),
      context,
    );
    routeCompareKeyboardShortcut(new KeyboardEvent('keydown', { key: 'Delete' }), context);

    expect(context.copySelection).toHaveBeenCalledOnce();
    expect(context.pasteSelection).toHaveBeenCalledOnce();
    expect(context.mutate).toHaveBeenLastCalledWith('delete selection', 'deleteSelection');
    expect(context.setHasSelection).toHaveBeenCalledWith('proposal', false);
  });
});

const deferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const mutationOptions = (
  overrides: Partial<CompareMutationControllerOptions> = {},
): CompareMutationControllerOptions => {
  const auxiliaryScore = {
    relayout: vi.fn(async () => true),
    npages: vi.fn(async () => 3),
  } as unknown as Score;
  const liveScore = {} as Score;
  return {
    view: { currentXml: '<current/>', checkpointXml: '<proposal/>' },
    activeSide: 'left',
    leftScore: auxiliaryScore,
    rightScore: liveScore,
    liveScore,
    swapBusy: false,
    feedbackBusy: false,
    beginBusy: vi.fn(),
    endBusy: vi.fn(),
    isBusy: () => false,
    isNoteInputCommitted: (role) => role === 'proposal',
    setActiveSide: vi.fn(),
    snapshotScore: vi.fn(async (_score, fallback) => fallback),
    runSerialized: async (operation) => operation(),
    invalidateOperations: vi.fn(() => 1),
    isGenerationCurrent: () => true,
    trackOperation: (operation) => operation,
    persistEdit: vi.fn(async () => '<persisted/>'),
    refreshLivePageCount: vi.fn(async () => {}),
    setAuxiliaryPageCount: vi.fn(),
    refreshNoteInputCursor: vi.fn(async () => null),
    reportError: vi.fn(),
    ...overrides,
  };
};

describe('useCompareMutationController', () => {
  it('resolves role from live score identity and persists the explicit side target', async () => {
    const options = mutationOptions();
    const action = vi.fn(async () => true);
    const { result } = renderHook(() => useCompareMutationController(options));

    await act(async () => {
      await expect(result.current('add a bar', action)).resolves.toBe(true);
    });

    expect(action).toHaveBeenCalledWith(options.leftScore);
    expect(options.refreshLivePageCount).not.toHaveBeenCalled();
    expect(options.setAuxiliaryPageCount).toHaveBeenCalledWith(3);
    expect(options.persistEdit).toHaveBeenCalledWith(
      options.leftScore,
      'left',
      '<proposal/>',
      expect.any(Function),
    );
    expect(options.refreshNoteInputCursor).toHaveBeenCalledWith(
      options.leftScore,
      'proposal',
      'left',
      expect.any(Function),
    );
  });

  it('drops a mutation invalidated while its score snapshot is in flight', async () => {
    const snapshot = deferred<string | null>();
    let currentGeneration = 1;
    const action = vi.fn(async () => true);
    const options = mutationOptions({
      snapshotScore: vi.fn(() => snapshot.promise),
      isGenerationCurrent: (generation) => generation === currentGeneration,
    });
    const { result } = renderHook(() => useCompareMutationController(options));

    let mutation!: Promise<boolean>;
    act(() => {
      mutation = result.current('stale edit', action);
    });
    currentGeneration = 2;
    snapshot.resolve('<proposal/>');

    await expect(mutation).resolves.toBe(false);
    expect(action).not.toHaveBeenCalled();
    expect(options.persistEdit).not.toHaveBeenCalled();
    expect(options.endBusy).toHaveBeenCalledOnce();
  });
});
