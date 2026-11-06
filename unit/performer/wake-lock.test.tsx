import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from '../../components/performer/platform/wakeLock';

type Listener = () => void;

function fakeWakeLock(refuse = false) {
  const sentinels: { released: boolean; listeners: Listener[]; release: () => Promise<void> }[] =
    [];
  const api = {
    request: vi.fn(async () => {
      if (refuse) throw new Error('NotAllowedError');
      const sentinel = {
        released: false,
        listeners: [] as Listener[],
        addEventListener: (_type: 'release', listener: Listener) =>
          sentinel.listeners.push(listener),
        release: async () => {
          sentinel.released = true;
          sentinel.listeners.forEach((listener) => listener());
        },
      };
      sentinels.push(sentinel);
      return sentinel;
    }),
  };
  Object.defineProperty(navigator, 'wakeLock', { value: api, configurable: true });
  return { api, sentinels };
}

const setVisibility = (state: 'visible' | 'hidden') =>
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });

afterEach(() => {
  delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
  setVisibility('visible');
});

describe('keeping the screen awake while performing', () => {
  it('holds the lock while active, takes it again when the page is shown, and lets go on unmount', async () => {
    setVisibility('visible');
    const { api, sentinels } = fakeWakeLock();
    const { result, unmount } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    });
    await act(async () => {});
    expect(result.current).toBe('on');
    expect(api.request).toHaveBeenCalledTimes(1);

    // Hidden: the browser releases it; shown again: requested again
    await act(async () => {
      setVisibility('hidden');
      await sentinels[0].release();
    });
    expect(result.current).toBe('off');
    await act(async () => {
      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(api.request).toHaveBeenCalledTimes(2);
    expect(result.current).toBe('on');

    unmount();
    expect(sentinels[1].released).toBe(true);
  });

  it('reports a refusal, and no API at all', async () => {
    fakeWakeLock(true);
    const refused = renderHook(() => useWakeLock(true));
    await act(async () => {});
    expect(refused.result.current).toBe('refused');
    refused.unmount();

    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    const none = renderHook(() => useWakeLock(true));
    expect(none.result.current).toBe('unsupported');
  });
});
