'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import React, { useSyncExternalStore } from 'react';
import { shortcutEntries } from '../toolbar/constants';
import { Button } from '../ui/Button';
import { Dialog, DialogContent } from '../ui/Dialog';
import { SHELL_SHORTCUTS } from './shellShortcuts';
import { formatShortcut } from './shortcutDisplay';
import { getShellUiState, setShortcutsOpen, subscribeToShellUi } from './shellStore';

const SHELL_LABELS: Record<string, string> = {
  'shell.palette': 'Command palette',
  'view.goto.prompt': 'Go to bar, rehearsal mark or page',
  'help.open': 'Editor help',
  'view.panel.instruments': 'Instruments panel',
  'view.panel.properties': 'Properties panel',
  'view.panel.palettes': 'Palettes panel',
  'view.panels.toggle': 'Toggle all panels',
  'view.zoom.in': 'Zoom in',
  'view.zoom.out': 'Zoom out',
  'view.zoom.preset': 'Zoom to 100%',
  'checkpoint.save': 'Save checkpoint',
  'file.open': 'Open score',
  'file.export.pdf': 'Export PDF',
  'format.flip': 'Flip direction',
};

/** Help ▸ Keyboard Shortcuts: the editing keys the editor handles plus the shell's own. */
export function ShortcutsDialog() {
  const open = useSyncExternalStore(
    subscribeToShellUi,
    () => getShellUiState().shortcutsOpen,
    () => getShellUiState().shortcutsOpen,
  );
  const shell = SHELL_SHORTCUTS.filter(
    // F7 is listed once the Instruments panel exists.
    (shortcut) => shortcut.commandId !== 'view.panel.instruments',
  );

  return (
    <Dialog open={open} onOpenChange={setShortcutsOpen}>
      <DialogContent
        className="max-h-[80vh] max-w-lg overflow-y-auto"
        data-testid="shortcuts-dialog"
      >
        <DialogPrimitive.Title className="text-base font-semibold text-slate-900">
          Keyboard shortcuts
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">
          Editing keys and the editor shortcuts.
        </DialogPrimitive.Description>
        <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Editing
        </h3>
        <ul className="mt-1 space-y-1 text-sm text-slate-800">
          {shortcutEntries.map((entry) => (
            <li key={entry.label} title={entry.title}>
              {entry.label}
            </li>
          ))}
        </ul>
        <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Editor
        </h3>
        <ul className="mt-1 space-y-1 text-sm text-slate-800">
          {shell.map((shortcut) => (
            <li key={shortcut.keys} className="flex justify-between gap-6">
              <span>{SHELL_LABELS[shortcut.commandId] ?? shortcut.commandId}</span>
              <kbd className="text-slate-500">{formatShortcut(shortcut.keys)}</kbd>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-end">
          <Button type="button" variant="outline" size="md" onClick={() => setShortcutsOpen(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
