import { describe, expect, it } from 'vitest';
import {
  BINDINGS,
  BROWSER_OWNED_UNBOUND,
  RESERVED_SHORTCUTS,
  comboMatches,
  contextsOverlap,
  eventToCombo,
  findConflicts,
  parseKeys,
  primaryShortcut,
  slotOf,
  type Binding,
} from '../../lib/commands/bindings';
import { allEditorCommands } from '../helpers/all-commands';

const press = (
  key: string,
  mods: Partial<Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>> = {},
) => eventToCombo({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

const matches = (keys: string, event: ReturnType<typeof press>) =>
  comboMatches(parseKeys(keys), event);

describe('the binding table', () => {
  it('has no two bindings that one keypress could both reach', () => {
    expect(findConflicts(BINDINGS)).toEqual([]);
  });

  it('never binds a key the browser reserves', () => {
    const reserved = new Set(RESERVED_SHORTCUTS.map((keys) => slotOf(parseKeys(keys))));
    expect(
      BINDINGS.filter((b) => reserved.has(slotOf(parseKeys(b.keys)))).map((b) => b.keys),
    ).toEqual([]);
  });

  it('leaves the browser-owned desktop defaults unbound', () => {
    const owned = new Set(BROWSER_OWNED_UNBOUND.map((keys) => slotOf(parseKeys(keys))));
    expect(BINDINGS.filter((b) => owned.has(slotOf(parseKeys(b.keys)))).map((b) => b.keys)).toEqual(
      [],
    );
  });

  it('keeps Ctrl+1..9 free: tab switching cannot be intercepted', () => {
    const slots = new Set(BINDINGS.map((b) => slotOf(parseKeys(b.keys))));
    for (let digit = 1; digit <= 9; digit += 1) {
      expect(slots.has(slotOf(parseKeys(`Mod+${digit}`))), `Mod+${digit}`).toBe(false);
    }
  });

  it('binds only commands that exist', () => {
    const ids = new Set(allEditorCommands().map((command) => command.id));
    expect(
      BINDINGS.filter((b) => b.commandId && !ids.has(b.commandId)).map((b) => b.commandId),
    ).toEqual([]);
  });

  it('gives every binding a command or marks it as swallowing', () => {
    expect(BINDINGS.filter((b) => !b.commandId && !b.swallow)).toEqual([]);
  });

  it('keeps New Score free: Ctrl+N cannot be captured in a tab', () => {
    expect(BINDINGS.some((b) => b.commandId === 'file.new')).toBe(false);
  });

  it('lets only the palette fire inside text fields', () => {
    expect(BINDINGS.filter((b) => b.inTextFields).map((b) => b.commandId)).toEqual([
      'shell.palette',
    ]);
  });

  it('parses every key string (a typo fails here, not at runtime)', () => {
    for (const binding of BINDINGS)
      expect(() => parseKeys(binding.keys), binding.keys).not.toThrow();
  });

  it('finds the first key of a command or of one family variant', () => {
    expect(primaryShortcut('edit.undo')).toBe('Mod+Z');
    expect(primaryShortcut('add.note.step', { step: 0, chord: false })).toBe('C');
    expect(primaryShortcut('add.note.step', { step: 0, chord: true })).toBe('Shift+C');
    expect(primaryShortcut('edit.duration.set', 4)).toBe('5');
    expect(primaryShortcut('view.zoom.preset', 1)).toBe('Mod+0');
    expect(primaryShortcut('file.new')).toBeUndefined();
  });
});

describe('conflict detection', () => {
  const b = (keys: string, context: Binding['context']): Binding => ({
    keys,
    context,
    commandId: 'x',
  });

  it('flags the same key in overlapping contexts', () => {
    expect(findConflicts([b('S', 'edit'), b('s', 'normal')])).toHaveLength(1);
    expect(findConflicts([b('S', 'global'), b('S', 'noteInput')])).toHaveLength(1);
  });

  it('allows the same key in contexts that never coexist', () => {
    expect(findConflicts([b('S', 'normal'), b('S', 'noteInput')])).toEqual([]);
    expect(findConflicts([b('S', 'edit'), b('S', 'compare')])).toEqual([]);
  });

  it('treats a modifier as part of the key', () => {
    expect(findConflicts([b('=', 'edit'), b('Mod+=', 'global')])).toEqual([]);
  });

  it('has the overlap rule it describes', () => {
    expect(contextsOverlap('edit', 'normal')).toBe(true);
    expect(contextsOverlap('normal', 'noteInput')).toBe(false);
    expect(contextsOverlap('compare', 'edit')).toBe(false);
    expect(contextsOverlap('global', 'compare')).toBe(true);
  });
});

describe('key matching', () => {
  it('treats Mod as Ctrl or Command, and letters case-insensitively', () => {
    expect(matches('Mod+S', press('s', { ctrlKey: true }))).toBe(true);
    expect(matches('Mod+S', press('s', { metaKey: true }))).toBe(true);
    expect(matches('Mod+S', press('S', { ctrlKey: true }))).toBe(true);
  });

  it('requires the modifiers to match exactly', () => {
    expect(matches('Mod+S', press('s'))).toBe(false);
    expect(matches('Mod+S', press('s', { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(matches('Mod+Shift+P', press('P', { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(matches('Mod+S', press('s', { ctrlKey: true, altKey: true }))).toBe(false);
    expect(matches('X', press('x', { ctrlKey: true }))).toBe(false);
  });

  it('reads + as Shift and =, from the main keyboard or the numpad', () => {
    expect(matches('Shift+=', press('+', { shiftKey: true }))).toBe(true);
    expect(matches('Shift+=', press('+'))).toBe(true);
    expect(matches('=', press('='))).toBe(true);
    expect(matches('Shift+=', press('='))).toBe(false);
  });

  it('maps shifted punctuation back to its key', () => {
    expect(matches('Shift+,', press('<', { shiftKey: true }))).toBe(true);
    expect(matches('Shift+5', press('%', { shiftKey: true }))).toBe(true);
  });

  it('names Space and the arrows', () => {
    expect(matches('Space', press(' '))).toBe(true);
    expect(
      matches('Mod+Shift+ArrowLeft', press('ArrowLeft', { ctrlKey: true, shiftKey: true })),
    ).toBe(true);
  });

  it('rejects an unknown modifier', () => {
    expect(() => parseKeys('Hyper+S')).toThrow(/Unknown modifier/);
  });

  it('keeps Ctrl+Shift+= and Ctrl+= apart from bare accidentals', () => {
    expect(matches('Mod+=', press('=', { ctrlKey: true }))).toBe(true);
    expect(matches('Mod+Shift+=', press('+', { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(matches('=', press('=', { ctrlKey: true }))).toBe(false);
  });
});
