import { describe, expect, it } from 'vitest';
import { turnForKey } from '../../components/performer';

const key = (
  k: string,
  mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {},
) => turnForKey({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });

describe('page-turn keys (Bluetooth pedals are keyboards)', () => {
  it('turns forward on right/down arrows, Page Down, Space and Enter, back on left/up arrows and Page Up', () => {
    for (const k of ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'])
      expect(key(k)).toBe('next');
    for (const k of ['ArrowLeft', 'ArrowUp', 'PageUp']) expect(key(k)).toBe('previous');
  });

  it('ignores other keys, and any key with a modifier (a shortcut, not a pedal)', () => {
    expect(key('a')).toBeNull();
    expect(key('Tab')).toBeNull();
    expect(key('ArrowRight', { metaKey: true })).toBeNull();
    expect(key('PageDown', { ctrlKey: true })).toBeNull();
    expect(key(' ', { altKey: true })).toBeNull();
  });
});
