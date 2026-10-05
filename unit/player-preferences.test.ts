// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPlayerPreference, writePlayerPreference } from '../lib/playback/player-preferences';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('player preferences', () => {
  it('round-trips a value', () => {
    writePlayerPreference('ots-player-test', 'note');
    expect(readPlayerPreference('ots-player-test')).toBe('note');
    expect(readPlayerPreference('ots-player-missing')).toBeNull();
  });

  it('survives storage that throws (private windows, blocked site data)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(readPlayerPreference('ots-player-test')).toBeNull();
    expect(() => writePlayerPreference('ots-player-test', 'x')).not.toThrow();
  });
});
