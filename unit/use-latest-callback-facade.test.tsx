import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLatestCallbackFacade } from '../lib/use-latest-callback-facade';

describe('useLatestCallbackFacade', () => {
  it('keeps its public identity while delegating to the latest implementation', () => {
    const initialImplementation = vi.fn((value: number) => `initial:${value}`);
    const nextImplementation = vi.fn((value: number) => `next:${value}`);
    const { result } = renderHook(() => useLatestCallbackFacade(initialImplementation));
    const stableCallback = result.current[0];

    expect(stableCallback(1)).toBe('initial:1');
    act(() => {
      result.current[1].current = nextImplementation;
    });

    expect(result.current[0]).toBe(stableCallback);
    expect(stableCallback(2)).toBe('next:2');
    expect(initialImplementation).toHaveBeenCalledOnce();
    expect(nextImplementation).toHaveBeenCalledOnce();
    expect(result.current[1].current).toBe(nextImplementation);
  });
});
