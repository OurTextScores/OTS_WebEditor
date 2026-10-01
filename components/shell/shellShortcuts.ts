import type { CommandId } from '../../lib/commands/types';

/**
 * The shortcut assignments the shell needs (SHELL_REDESIGN_DESIGN §6). Assignments only:
 * binding contexts, conflict detection and the help-page generator are W2. Every
 * existing note-entry and editing key stays with `ScoreEditor`'s own handler.
 */
export interface ShellShortcut {
  /** Registry grammar: 'Mod+Shift+P'. Mod is Ctrl, or ⌘ on macOS. */
  readonly keys: string;
  readonly commandId: CommandId;
  readonly arg?: unknown;
  /** Fires even while a text field has focus (only the palette does). */
  readonly inTextFields?: boolean;
}

export const SHELL_SHORTCUTS: readonly ShellShortcut[] = [
  { keys: 'Mod+Shift+P', commandId: 'shell.palette', inTextFields: true },
  { keys: 'Mod+F', commandId: 'view.goto.prompt' },
  { keys: 'F1', commandId: 'help.open' },
  { keys: 'F7', commandId: 'view.panel.instruments' },
  { keys: 'F8', commandId: 'view.panel.properties' },
  { keys: 'F9', commandId: 'view.panel.palettes' },
  { keys: 'Mod+\\', commandId: 'view.panels.toggle' },
  { keys: 'Mod+=', commandId: 'view.zoom.in' },
  { keys: 'Mod+-', commandId: 'view.zoom.out' },
  { keys: 'Mod+0', commandId: 'view.zoom.preset', arg: 1 },
  { keys: 'Mod+S', commandId: 'checkpoint.save' },
  { keys: 'Mod+O', commandId: 'file.open' },
  { keys: 'Mod+P', commandId: 'file.export.pdf' },
  { keys: 'X', commandId: 'format.flip' },
];

/**
 * Keys a browser tab reserves, so they can neither be captured nor shown as assignments:
 * reload, fullscreen, devtools, new/close tab and window, and tab switching. New Score
 * has no shortcut for the same reason (Ctrl+N).
 */
export const RESERVED_SHORTCUTS: readonly string[] = [
  'F5',
  'F11',
  'F12',
  'Mod+N',
  'Mod+T',
  'Mod+W',
  'Mod+Shift+N',
  'Mod+Shift+T',
  'Ctrl+Tab',
];

const normalise = (key: string) => (key === '+' ? '=' : key.toLowerCase());

/** Does this keydown press `keys`? Shift and Alt must match exactly; Mod is Ctrl or ⌘. */
export function matchesShortcut(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
  keys: string,
): boolean {
  const parts = keys.split('+');
  // A literal '+' key arrives as an empty trailing part.
  const key = parts[parts.length - 1] === '' ? '+' : parts[parts.length - 1];
  const modifiers = new Set(
    parts.slice(0, parts.length - (parts[parts.length - 1] === '' ? 2 : 1)),
  );
  const wantsMod = modifiers.has('Mod');
  return (
    normalise(event.key) === normalise(key) &&
    (event.ctrlKey || event.metaKey) === wantsMod &&
    event.shiftKey === modifiers.has('Shift') &&
    event.altKey === modifiers.has('Alt')
  );
}
