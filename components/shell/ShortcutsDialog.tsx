'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import React, { useMemo, useSyncExternalStore } from 'react';
import { Button } from '../ui/Button';
import { Dialog, DialogContent } from '../ui/Dialog';
import { buildShortcutSections } from './shortcutList';
import { formatShortcut } from './shortcutDisplay';
import { getShellUiState, setShortcutsOpen, subscribeToShellUi } from './shellStore';

/**
 * Help ▸ Keyboard Shortcuts. Generated from the binding table and the command labels, so it
 * cannot disagree with what the keys do.
 */
export function ShortcutsDialog() {
  const open = useSyncExternalStore(
    subscribeToShellUi,
    () => getShellUiState().shortcutsOpen,
    () => getShellUiState().shortcutsOpen,
  );
  const sections = useMemo(() => buildShortcutSections(), []);

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
          Every key the editor binds, by where it applies.
        </DialogPrimitive.Description>
        {sections.map((section) => (
          <section key={section.title}>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {section.title}
            </h3>
            {section.blurb && <p className="mt-1 text-xs text-slate-500">{section.blurb}</p>}
            <ul className="mt-1 space-y-1 text-sm text-slate-800">
              {section.rows.map((row) => (
                <li key={row.label} className="flex justify-between gap-6">
                  <span>{row.label}</span>
                  <kbd className="shrink-0 text-right text-slate-500">
                    {row.keys.map((keys) => formatShortcut(keys)).join('  ')}
                  </kbd>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <div className="mt-5 flex justify-end">
          <Button type="button" variant="outline" size="md" onClick={() => setShortcutsOpen(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
