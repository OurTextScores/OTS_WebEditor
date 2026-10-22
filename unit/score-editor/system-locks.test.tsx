import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Score, SystemLockState } from '../../lib/webmscore-loader';
import {
  SystemLocksPanel,
  hasSystemLockApi,
  useSystemLocks,
} from '../../components/score-editor/system-locks';
import { BooleanPropertyControl } from '../../components/score-editor/properties';
import { systemLockProperty } from '../../components/score-editor/system-locks';
import type { EditorCore } from '../../components/score-editor/core';

const state = (overrides: Partial<SystemLockState> = {}): SystemLockState => ({
  selection: { startMeasure: 0, endMeasure: 2 },
  locks: [],
  locked: { value: false, mixed: false, applicableCount: 1 },
  canLock: true,
  canUnlock: false,
  canMovePrevious: false,
  canMoveNext: false,
  ...overrides,
});
const scoreWithApi = (overrides: Partial<Score> = {}) =>
  ({
    getSystemLockState: vi.fn(async () => state()),
    setSystemLock: vi.fn(async () => true),
    moveSelectedMeasureToSystem: vi.fn(async () => true),
    ...overrides,
  }) as unknown as Score;
function context(score: Score | null) {
  return {
    score,
    scoreRef: { current: score },
    ensureSelectionInWasm: vi.fn(async () => {}),
    performMutation: vi.fn(async (_label, action) => action?.()),
    runSerializedScoreOperation: vi.fn(async (action) => action()),
  } satisfies Pick<
    EditorCore,
    | 'score'
    | 'scoreRef'
    | 'ensureSelectionInWasm'
    | 'performMutation'
    | 'runSerializedScoreOperation'
  >;
}

describe('capability-gated system locks', () => {
  it('requires every native operation and hides the UI on old engines', () => {
    expect(hasSystemLockApi(null)).toBe(false);
    expect(hasSystemLockApi(scoreWithApi({ moveSelectedMeasureToSystem: undefined }))).toBe(false);
    const ctx = context({} as Score);
    const { result } = renderHook(() => useSystemLocks(ctx, 0));
    render(<SystemLocksPanel model={result.current} disabled={false} />);
    expect(screen.queryByRole('region', { name: 'System layout' })).toBeNull();
    expect(ctx.runSerializedScoreOperation).not.toHaveBeenCalled();
  });

  it('locks through the editor transaction and refreshes state without reselecting old geometry', async () => {
    const score = scoreWithApi();
    const ctx = context(score);
    const { result } = renderHook(() => useSystemLocks(ctx, 0));
    await waitFor(() => expect(result.current.state).not.toBeNull());
    await act(() => result.current.mutate(true));
    expect(ctx.ensureSelectionInWasm).toHaveBeenCalledOnce();
    expect(score.setSystemLock).toHaveBeenCalledWith(true);
    expect(ctx.performMutation).toHaveBeenCalledWith(
      'lock selected measures',
      expect.any(Function),
      { skipWasmReselect: true },
    );
    expect(score.getSystemLockState).toHaveBeenCalledTimes(2);
    await act(() => result.current.mutate('next'));
    expect(score.moveSelectedMeasureToSystem).toHaveBeenCalledWith('next');
  });

  it('refreshes when selection or undo changes and discards a late read from a replaced score', async () => {
    let resolve!: (value: SystemLockState) => void;
    const old = scoreWithApi({
      getSystemLockState: vi.fn(
        () =>
          new Promise<SystemLockState>((done) => {
            resolve = done;
          }),
      ),
    });
    const ctx = context(old);
    const { result, rerender } = renderHook(({ revision }) => useSystemLocks(ctx, revision), {
      initialProps: { revision: 0 },
    });
    const replacement = scoreWithApi();
    ctx.score = replacement;
    ctx.scoreRef.current = replacement;
    rerender({ revision: 1 });
    await waitFor(() => expect(result.current.state?.locks).toEqual([]));
    await act(async () => resolve(state({ locks: [{ startMeasure: 4, endMeasure: 7 }] })));
    expect(result.current.state?.locks).toEqual([]);
    rerender({ revision: 2 });
    await waitFor(() => expect(replacement.getSystemLockState).toHaveBeenCalledTimes(2));
  });

  it('shows rejected operations and allows a later refresh', async () => {
    const ctx = context(scoreWithApi({ setSystemLock: vi.fn(async () => false) }));
    const { result } = renderHook(() => useSystemLocks(ctx, 0));
    await act(() => result.current.mutate(true));
    expect(result.current.error).toMatch(/not available/);
    expect(result.current.busy).toBe(false);
  });

  it('shows mixed values, resets to the defined default, and respects disabled controls', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <BooleanPropertyControl
        definition={systemLockProperty}
        state={{ value: null, mixed: true, applicableCount: 1 }}
        disabled={false}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('checkbox')).toHaveProperty('indeterminate', true);
    fireEvent.click(screen.getByRole('button', { name: 'Unlock selected measures' }));
    expect(onChange).toHaveBeenCalledWith(false);
    rerender(
      <BooleanPropertyControl
        definition={systemLockProperty}
        state={{ value: false, mixed: false, applicableCount: 1 }}
        disabled
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders authoritative lock spans and disables unavailable measure moves', () => {
    const mutate = vi.fn();
    render(
      <SystemLocksPanel
        disabled={false}
        model={{
          supported: true,
          busy: false,
          error: null,
          mutate,
          state: state({ locks: [{ startMeasure: 0, endMeasure: 2 }], canMoveNext: true }),
        }}
      />,
    );
    expect(screen.getByText('Locked measure positions 1–3')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Move to previous system' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move to next system' }));
    expect(mutate).toHaveBeenCalledWith('next');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(mutate).toHaveBeenCalledWith(true);
  });
});
