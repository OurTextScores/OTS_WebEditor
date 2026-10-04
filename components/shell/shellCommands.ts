import { defaultCommandRegistry } from '../../lib/commands/registry';
import { defineCommand, defineFamily, type AnyCommand } from '../../lib/commands/types';
import {
  getHiddenSections,
  toggleSectionHidden,
  writeHiddenSections,
} from './toolbar/strip/stripPersistence';
import { STRIP_SECTIONS } from './toolbar/strip/stripSections';
import { closeTopEscapeLayer, hasEscapeLayer } from './keyboard/escapeLayers';
import {
  closePalette,
  getShellUiState,
  openPalette,
  setShortcutsOpen,
  setStatusBarPinned,
} from './shellStore';

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
      opensDialog: true,
      keywords: ['go to', 'jump', 'bar', 'measure', 'rehearsal', 'page'],
      run: () => openPalette('goto'),
    }),
    defineCommand({
      // Escape: close the innermost open thing; with nothing open, clear the selection.
      id: 'shell.escape',
      label: 'Cancel',
      visible: () => false,
      // In a compare session Escape belongs to the pane (it leaves the pane's note input).
      enabled: (ctx) => hasEscapeLayer() || (ctx.mode !== 'compare' && ctx.selection !== 'none'),
      run: async () => {
        if (closeTopEscapeLayer()) return;
        await defaultCommandRegistry.run('edit.deselect');
      },
    }),
    defineFamily<string>({
      id: 'view.toolbar.section',
      label: 'Toolbar Section',
      variants: STRIP_SECTIONS.map((section) => ({ arg: section.id, label: section.label })),
      checked: (_ctx, id) => !getHiddenSections().includes(id),
      run: (_ctx, id) => toggleSectionHidden(id),
    }),
    defineCommand({
      id: 'view.toolbar.showAll',
      label: 'Show All Toolbar Sections',
      keywords: ['toolbar', 'reset', 'tools', 'ribbon'],
      enabled: () => getHiddenSections().length > 0,
      run: () => writeHiddenSections([]),
    }),
    defineCommand({
      id: 'help.shortcuts',
      label: 'Keyboard Shortcuts',
      keywords: ['keys', 'hotkeys', 'help'],
      run: () => setShortcutsOpen(true),
    }),
  ];
}

/** Registered by the status bar itself, which is the only thing that can pin or unpin it. */
export function buildStatusBarCommands(): AnyCommand[] {
  return [
    defineCommand({
      id: 'view.statusBar',
      label: 'Status Bar',
      keywords: ['page', 'zoom', 'show', 'hide'],
      checked: () => getShellUiState().statusBarPinned,
      run: () => setStatusBarPinned(!getShellUiState().statusBarPinned),
    }),
  ];
}
