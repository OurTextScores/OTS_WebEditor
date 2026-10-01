import { describe, expect, it } from 'vitest';
import {
  RESERVED_SHORTCUTS,
  SHELL_SHORTCUTS,
  matchesShortcut,
} from '../../components/shell/shellShortcuts';
import { formatShortcut } from '../../components/shell/shortcutDisplay';
import { allEditorCommands } from '../helpers/all-commands';

const press = (
  key: string,
  mods: Partial<Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>> = {},
) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

describe('shell shortcut assignments', () => {
  it('has no duplicates', () => {
    const keys = SHELL_SHORTCUTS.map((s) => s.keys.toLowerCase());
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([]);
  });

  it('never binds a key the browser reserves', () => {
    const reserved = RESERVED_SHORTCUTS.map((key) => key.toLowerCase());
    expect(SHELL_SHORTCUTS.filter((s) => reserved.includes(s.keys.toLowerCase()))).toEqual([]);
  });

  it('binds only commands that exist, except those a later phase registers', () => {
    const ids = new Set(allEditorCommands().map((c) => c.id));
    const later = new Set(['view.panel.instruments']); // Phase 3
    const unknown = SHELL_SHORTCUTS.filter((s) => !ids.has(s.commandId) && !later.has(s.commandId));
    expect(unknown).toEqual([]);
  });

  it('agrees with the shortcut each command displays', () => {
    const byId = new Map(allEditorCommands().map((c) => [c.id, c as { shortcut?: string }]));
    const wrong = SHELL_SHORTCUTS.filter((s) => {
      const shown = byId.get(s.commandId)?.shortcut;
      return shown && s.arg === undefined && shown !== s.keys;
    });
    expect(wrong).toEqual([]);
  });

  it('keeps New Score free: Ctrl+N cannot be captured in a tab', () => {
    expect(SHELL_SHORTCUTS.some((s) => s.commandId === 'file.new')).toBe(false);
  });

  it('lets only the palette fire inside text fields', () => {
    expect(SHELL_SHORTCUTS.filter((s) => s.inTextFields).map((s) => s.commandId)).toEqual([
      'shell.palette',
    ]);
  });
});

describe('matchesShortcut', () => {
  it('treats Mod as Ctrl or Command', () => {
    expect(matchesShortcut(press('s', { ctrlKey: true }), 'Mod+S')).toBe(true);
    expect(matchesShortcut(press('s', { metaKey: true }), 'Mod+S')).toBe(true);
    expect(matchesShortcut(press('S', { ctrlKey: true }), 'Mod+S')).toBe(true);
  });

  it('requires the modifiers to match exactly', () => {
    expect(matchesShortcut(press('s'), 'Mod+S')).toBe(false);
    expect(matchesShortcut(press('s', { ctrlKey: true, shiftKey: true }), 'Mod+S')).toBe(false);
    expect(matchesShortcut(press('P', { ctrlKey: true, shiftKey: true }), 'Mod+Shift+P')).toBe(
      true,
    );
    expect(matchesShortcut(press('p', { ctrlKey: true }), 'Mod+Shift+P')).toBe(false);
    expect(matchesShortcut(press('s', { ctrlKey: true, altKey: true }), 'Mod+S')).toBe(false);
  });

  it('matches a bare key only without modifiers', () => {
    expect(matchesShortcut(press('x'), 'X')).toBe(true);
    expect(matchesShortcut(press('x', { ctrlKey: true }), 'X')).toBe(false);
    expect(matchesShortcut(press('F9'), 'F9')).toBe(true);
  });

  it('accepts + as the = key for zoom in', () => {
    expect(matchesShortcut(press('=', { ctrlKey: true }), 'Mod+=')).toBe(true);
    expect(matchesShortcut(press('+', { ctrlKey: true, shiftKey: true }), 'Mod+=')).toBe(false);
    expect(matchesShortcut(press('+', { ctrlKey: true }), 'Mod+=')).toBe(true);
  });

  it('matches punctuation keys', () => {
    expect(matchesShortcut(press('\\', { ctrlKey: true }), 'Mod+\\')).toBe(true);
    expect(matchesShortcut(press('-', { ctrlKey: true }), 'Mod+-')).toBe(true);
    expect(matchesShortcut(press('0', { ctrlKey: true }), 'Mod+0')).toBe(true);
  });
});

describe('formatShortcut', () => {
  it('writes Ctrl and Shift out on Windows and Linux', () => {
    expect(formatShortcut('Mod+Shift+P', false)).toBe('Ctrl+Shift+P');
    expect(formatShortcut('Mod+ArrowUp', false)).toBe('Ctrl+↑');
    expect(formatShortcut('Delete', false)).toBe('Del');
  });

  it('uses symbols on macOS', () => {
    expect(formatShortcut('Mod+Shift+P', true)).toBe('⌘⇧P');
  });

  it('shows nothing for no shortcut', () => {
    expect(formatShortcut(undefined)).toBe('');
  });
});
