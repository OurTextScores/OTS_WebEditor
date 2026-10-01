import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resolveShellVersion,
  V2_HIDDEN_RIBBON_SECTIONS,
} from '../../components/shell/shellVersion';

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('resolveShellVersion', () => {
  it('is v2 by default', () => {
    expect(resolveShellVersion('')).toBe('v2');
    expect(resolveShellVersion('?score=/a.mscz')).toBe('v2');
  });

  it('takes legacy from the URL and remembers it for the tab', () => {
    expect(resolveShellVersion('?shell=legacy')).toBe('legacy');
    // A later load without the parameter keeps the tab's choice.
    expect(resolveShellVersion('?score=/a.mscz')).toBe('legacy');
  });

  it('lets the URL change the remembered choice', () => {
    resolveShellVersion('?shell=legacy');
    expect(resolveShellVersion('?shell=v2')).toBe('v2');
    expect(resolveShellVersion('')).toBe('v2');
  });

  it('ignores a value it does not know', () => {
    expect(resolveShellVersion('?shell=v3')).toBe('v2');
    resolveShellVersion('?shell=legacy');
    expect(resolveShellVersion('?shell=nonsense')).toBe('legacy');
  });

  it('still honours the URL when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(resolveShellVersion('?shell=legacy')).toBe('legacy');
    expect(resolveShellVersion('')).toBe('v2');
  });
});

describe('V2_HIDDEN_RIBBON_SECTIONS', () => {
  it('are the five sections SHELL_REDESIGN_DESIGN Phase 2 takes over', () => {
    expect([...V2_HIDDEN_RIBBON_SECTIONS]).toEqual(['file', 'view', 'playback', 'tempo', 'help']);
  });
});
