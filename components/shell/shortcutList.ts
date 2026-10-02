import { BINDINGS, type Binding, type KeyContext } from '../../lib/commands/bindings';
import { buildCommandCatalog } from '../score-editor/commandCatalog';
import { isCommandFamily, type AnyCommand, type CommandFamily } from '../../lib/commands/types';

/**
 * The shortcut list shown in the editor, on the help page and in `docs/KEYBOARD_SHORTCUTS.md`,
 * generated from the binding table and the command labels. Nothing here is written by hand
 * except the section titles and the few labels the commands cannot supply.
 */
export interface ShortcutRow {
  readonly label: string;
  /** Grammar strings ('Mod+Shift+P'); the caller formats them for the platform. */
  readonly keys: readonly string[];
}

export interface ShortcutSection {
  readonly title: string;
  readonly blurb?: string;
  readonly rows: readonly ShortcutRow[];
}

const SECTIONS: readonly { context: KeyContext; title: string; blurb?: string }[] = [
  { context: 'global', title: 'Everywhere' },
  {
    context: 'edit',
    title: 'Editing',
    blurb: 'With a selection, or in note input. Each acts on what is selected.',
  },
  { context: 'normal', title: 'Selection mode' },
];

/** Labels a command's own label does not say well enough in a list of keys. */
const LABELS: Record<string, string> = {
  'shell.escape': 'Cancel: close the innermost open item, then clear the selection',
  'view.zoom.preset': 'Zoom to 100%',
  'edit.duration.set': 'Set duration (1 = 64th … 7 = whole, 8 = breve)',
  'add.note.step': 'Enter a note by letter (Shift adds it to the chord)',
};

const sameArg = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function labelOf(binding: Binding, catalog: ReadonlyMap<string, AnyCommand>): string {
  const id = binding.commandId ?? '';
  const entry = catalog.get(id);
  const override = LABELS[id];
  if (override) return override;
  if (!entry) return id;
  if (isCommandFamily(entry)) {
    const family = entry as unknown as CommandFamily<unknown>;
    const variant = family.variants.find((candidate) => sameArg(candidate.arg, binding.arg));
    return variant ? `${family.label}: ${variant.label}` : family.label;
  }
  return (entry as { label: string }).label;
}

export function buildShortcutSections(
  bindings: readonly Binding[] = BINDINGS,
  commands: readonly AnyCommand[] = buildCommandCatalog(),
): ShortcutSection[] {
  const catalog = new Map(commands.map((command) => [command.id, command]));
  return SECTIONS.map(({ context, title, blurb }) => {
    // One row per command, however many keys it has: "Redo: Mod+Shift+Z, Mod+Y".
    const rows = new Map<string, { label: string; keys: string[] }>();
    for (const binding of bindings) {
      if (binding.context !== context || !binding.commandId) continue;
      const family = catalog.get(binding.commandId);
      // A family bound to many keys (durations, letters) is one row; its keys list in order.
      const collapse = family && isCommandFamily(family) && LABELS[binding.commandId];
      const rowKey = collapse
        ? binding.commandId
        : `${binding.commandId}\0${JSON.stringify(binding.arg)}`;
      const existing = rows.get(rowKey);
      if (existing) existing.keys.push(binding.keys);
      else rows.set(rowKey, { label: labelOf(binding, catalog), keys: [binding.keys] });
    }
    return { title, ...(blurb ? { blurb } : {}), rows: [...rows.values()] };
  }).filter((section) => section.rows.length > 0);
}
