import { defineCommand, type AnyCommand } from '../../lib/commands/types';
import { closePalette, getShellUiState, openPalette, setShortcutsOpen } from './shellStore';

/**
 * The commands the shell itself owns: they open shell UI and need nothing from the
 * editor. Everything else is registered by the ribbon adapters (`editorCommands.ts`) or
 * `ScoreEditor`'s bindings (`shellCommands.ts` under `score-editor/`).
 */
export function buildShellOwnCommands(): AnyCommand[] {
  return [
    defineCommand({
      id: 'shell.palette',
      label: 'Command Palette',
      shortcut: 'Mod+Shift+P',
      keywords: ['search', 'commands', 'find'],
      run: () => {
        // The same key closes it, as in VS Code.
        if (getShellUiState().palette.open) closePalette();
        else openPalette('commands');
      },
    }),
    defineCommand({
      id: 'view.goto.prompt',
      label: 'Bar or Rehearsal Mark',
      shortcut: 'Mod+F',
      opensDialog: true,
      keywords: ['go to', 'jump', 'bar', 'measure', 'rehearsal', 'page'],
      run: () => openPalette('goto'),
    }),
    defineCommand({
      id: 'help.shortcuts',
      label: 'Keyboard Shortcuts',
      keywords: ['keys', 'hotkeys', 'help'],
      run: () => setShortcutsOpen(true),
    }),
  ];
}
