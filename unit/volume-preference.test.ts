// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getVolumePreference,
  getVolumePreferenceOnServer,
  readStoredVolume,
  resetVolumePreferenceForTests,
  setVolumePreference,
  subscribeVolumePreference,
} from '../lib/playback/volume-preference';
import { useVolumePreference } from '../lib/playback/use-volume-preference';

const KEY = 'ots-player-volume-v2';
const LEGACY_KEY = 'ots-player-volume';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  resetVolumePreferenceForTests();
});

describe('stored volume', () => {
  it('is absent, not zero, for a listener who has never chosen a volume', () => {
    // The regression: Number(null) is 0, so "nothing stored" was restored as silence.
    expect(readStoredVolume()).toBeNull();
    window.localStorage.setItem(KEY, '');
    expect(readStoredVolume()).toBeNull();
    window.localStorage.setItem(KEY, 'loud');
    expect(readStoredVolume()).toBeNull();
  });

  it('keeps a stored volume inside the slider range', () => {
    window.localStorage.setItem(KEY, '7');
    expect(readStoredVolume()).toBe(1);
    window.localStorage.setItem(KEY, '-3');
    expect(readStoredVolume()).toBe(0);
  });

  it('ignores the silence the old key saved for everyone, but carries a real choice over', () => {
    window.localStorage.setItem(LEGACY_KEY, '0');
    expect(readStoredVolume()).toBeNull();
    window.localStorage.setItem(LEGACY_KEY, '0.6');
    expect(readStoredVolume()).toBe(0.6);
    // A choice made since then wins over the carried-over one.
    window.localStorage.setItem(KEY, '0.2');
    expect(readStoredVolume()).toBe(0.2);
  });
});

describe('volume preference', () => {
  it('starts at full volume and writes nothing just by being read', () => {
    expect(getVolumePreference()).toBe(1);
    expect(getVolumePreferenceOnServer()).toBe(1);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('stays audible for a listener the old key left at zero', () => {
    window.localStorage.setItem(LEGACY_KEY, '0');
    expect(getVolumePreference()).toBe(1);
  });

  it('remembers a chosen volume across a reload, including a deliberate mute', () => {
    setVolumePreference(0.4);
    expect(getVolumePreference()).toBe(0.4);
    expect(window.localStorage.getItem(KEY)).toBe('0.4');
    resetVolumePreferenceForTests();
    expect(getVolumePreference()).toBe(0.4);

    setVolumePreference(0);
    resetVolumePreferenceForTests();
    expect(getVolumePreference()).toBe(0);
  });

  it('clamps to the slider range and ignores values that are not volumes', () => {
    setVolumePreference(4);
    expect(getVolumePreference()).toBe(1);
    setVolumePreference(-1);
    expect(getVolumePreference()).toBe(0);
    setVolumePreference(0.5);
    setVolumePreference(Number.NaN);
    expect(getVolumePreference()).toBe(0.5);
    expect(window.localStorage.getItem(KEY)).toBe('0.5');
  });

  it('notifies subscribers until they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeVolumePreference(listener);
    setVolumePreference(0.3);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setVolumePreference(0.8);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('still sets the volume when storage throws (private windows, blocked site data)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(getVolumePreference()).toBe(1);
    expect(() => setVolumePreference(0.5)).not.toThrow();
    expect(getVolumePreference()).toBe(0.5);
  });
});

describe('useVolumePreference', () => {
  it('follows the store', () => {
    window.localStorage.setItem(KEY, '0.25');
    const { result } = renderHook(() => useVolumePreference());
    expect(result.current).toBe(0.25);
    act(() => setVolumePreference(0.75));
    expect(result.current).toBe(0.75);
  });
});
