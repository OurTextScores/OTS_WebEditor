import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildShortcutDocument } from '../../components/shell/shortcutDocument';
import { buildShortcutSections } from '../../components/shell/shortcutList';
import { BINDINGS } from '../../lib/commands/bindings';

const DOC = resolve(__dirname, '../../docs/KEYBOARD_SHORTCUTS.md');

describe('generated shortcut list', () => {
  it('lists every command-bound key exactly once', () => {
    const listed = buildShortcutSections().flatMap((section) =>
      section.rows.flatMap((row) => row.keys),
    );
    const bound = BINDINGS.filter((b) => b.commandId).map((b) => b.keys);
    expect(listed.sort()).toEqual(bound.sort());
  });

  it('collapses a family bound to many keys into one row', () => {
    const editing = buildShortcutSections().find((section) => section.title === 'Editing');
    const durations = editing?.rows.find((row) => row.label.startsWith('Set duration'));
    expect(durations?.keys).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  });

  it('gives a command with several keys one row', () => {
    const editing = buildShortcutSections().find((section) => section.title === 'Editing');
    expect(editing?.rows.find((row) => row.label === 'Redo')?.keys).toEqual([
      'Mod+Shift+Z',
      'Mod+Y',
    ]);
  });

  it('is what docs/KEYBOARD_SHORTCUTS.md says', () => {
    const generated = buildShortcutDocument();
    if (process.env.UPDATE_SHORTCUT_DOC === '1') writeFileSync(DOC, generated);
    expect(
      readFileSync(DOC, 'utf8'),
      'Regenerate: UPDATE_SHORTCUT_DOC=1 npx vitest run unit/shell/shortcut-doc.test.ts',
    ).toBe(generated);
  });
});
