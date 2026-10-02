import { BROWSER_OWNED_UNBOUND, RESERVED_SHORTCUTS } from '../../lib/commands/bindings';
import { formatShortcutGeneric } from './shortcutDisplay';
import { buildShortcutSections } from './shortcutList';

/**
 * `docs/KEYBOARD_SHORTCUTS.md`, generated from the binding table. A unit test fails when the
 * checked-in file is stale; regenerate with
 *
 *   UPDATE_SHORTCUT_DOC=1 npx vitest run unit/shell/shortcut-doc.test.ts
 */
export function buildShortcutDocument(): string {
  const chord = (keys: string) => `\`${formatShortcutGeneric(keys)}\``;
  const lines = [
    '# Keyboard shortcuts',
    '',
    '> Generated from `lib/commands/bindings.ts` and the command labels by',
    '> `components/shell/shortcutDocument.ts`. Do not edit by hand.',
    '',
    "Desktop MuseScore's shortcuts are the defaults. `Ctrl/Cmd` is Ctrl on Windows and Linux, ⌘ on macOS.",
    'The same list is in the editor under **Help ▸ Keyboard Shortcuts** and on the help page.',
    '',
  ];
  for (const section of buildShortcutSections()) {
    lines.push(`## ${section.title}`, '');
    if (section.blurb) lines.push(section.blurb, '');
    lines.push('| Action | Keys |', '| --- | --- |');
    for (const row of section.rows) {
      lines.push(`| ${row.label} | ${row.keys.map(chord).join(' · ')} |`);
    }
    lines.push('');
  }
  lines.push(
    '## What is deliberately not bound',
    '',
    'A page cannot capture every key, and a few desktop defaults would do something else in a browser.',
    '',
    `- **Reserved by the browser** (cannot be captured, so no editor command uses them): ${RESERVED_SHORTCUTS.map(chord).join(', ')}. Ctrl/Cmd+N (New Score) and Ctrl/Cmd+T (Staff Text) are on this list; reach those commands from the menus or the command palette.`,
    `- **Left unbound** (the browser or OS acts on them, and not every engine lets a page take them): ${BROWSER_OWNED_UNBOUND.map(chord).join(', ')}. The commands stay in the menus and the palette.`,
    '',
    '## Limits',
    '',
    '- Keys that need Shift on a US keyboard (`+`, `<`, `>`) are written as the physical key plus Shift. Other layouts may need a different chord for them.',
    '- Keys typed into a text field, or while a dialog or menu is open, are not editing keys. Only the command palette key works there.',
    '- Escape cancels the innermost open thing first: a drag, a grip edit, the floating palettes, note input, and finally the selection.',
    '',
  );
  return lines.join('\n');
}
