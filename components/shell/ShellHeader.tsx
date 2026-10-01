'use client';

import { Search } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { defaultCommandRegistry, type CommandRegistry } from '../../lib/commands/registry';
import { useRegisterCommands } from '../../lib/commands/useRegisterCommands';
import { CommandFormDialog } from './CommandFormDialog';
import { CommandPalette } from './CommandPalette';
import { MenuBar } from './MenuBar';
import { Transport } from './Transport';
import { invokeCommand } from './invokeCommand';
import { registerFilePicker } from './filePickers';
import { ShortcutsDialog } from './ShortcutsDialog';
import { formatShortcut } from './shortcutDisplay';
import { openPalette } from './shellStore';
import { buildShellOwnCommands } from './shellCommands';
import { useShellShortcuts } from './useShellShortcuts';

const COMPACT_QUERY = '(max-width: 719px)';

/** Below 720px the menu bar collapses into one app menu (§4.1). */
function useCompact(): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const query = window.matchMedia(COMPACT_QUERY);
      query.addEventListener('change', notify);
      return () => query.removeEventListener('change', notify);
    },
    () =>
      typeof window !== 'undefined' &&
      Boolean(window.matchMedia) &&
      window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  );
}

/**
 * The header (SHELL_REDESIGN_DESIGN §4.1): score title with a dot when it has changed since
 * the last checkpoint, the complete menu bar, and the palette button. Also mounts what the
 * menus and palette open: the palette, argument forms and the shortcuts list.
 *
 * Transport joins the header in Phase 2.
 */
export function ShellHeader({
  title,
  dirty,
  v2 = false,
  registry = defaultCommandRegistry,
}: {
  title: string;
  dirty: boolean;
  /** The v2 shell: transport joins the header and the hidden file inputs live here. */
  v2?: boolean;
  registry?: CommandRegistry;
}) {
  const ownCommands = useMemo(() => buildShellOwnCommands(), []);
  useRegisterCommands('global', ownCommands, registry);
  useShellShortcuts(registry);
  const compact = useCompact();
  const scoreInput = useRef<HTMLInputElement>(null);
  const soundFontInput = useRef<HTMLInputElement>(null);

  // The inputs a spec drives with setInputFiles and File ▸ Open drives with click().
  useEffect(() => {
    if (!v2) return;
    const removeScore = registerFilePicker('score', () => scoreInput.current?.click());
    const removeFont = registerFilePicker('soundfont', () => soundFontInput.current?.click());
    return () => {
      removeScore();
      removeFont();
    };
  }, [v2]);

  const onPicked = (id: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so choosing the same file twice still fires a change.
    event.target.value = '';
    if (file) void invokeCommand(id, file, registry);
  };

  return (
    <>
      <header
        role="banner"
        data-testid="shell-header"
        className="relative flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3"
        style={{ height: 'var(--shell-header-h, 44px)', zIndex: 110 }}
      >
        <div className="flex min-w-0 max-w-[16rem] items-center gap-1.5" data-testid="shell-title">
          <span className="truncate text-sm font-semibold text-slate-900">
            {title || 'Untitled score'}
          </span>
          {dirty && (
            <span
              data-testid="shell-dirty-dot"
              role="img"
              aria-label="Changes since the last checkpoint"
              title="Changes since the last checkpoint"
              className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
            />
          )}
        </div>
        <MenuBar registry={registry} compact={compact} />
        {v2 && (
          <>
            <Transport registry={registry} />
            <input
              ref={scoreInput}
              data-testid="open-score-input"
              type="file"
              accept=".mscz,.mscx,.mxl,.xml,.musicxml"
              className="hidden"
              onChange={onPicked('file.open')}
            />
            <input
              ref={soundFontInput}
              data-testid="soundfont-input"
              type="file"
              accept=".sf2,.sf3"
              className="hidden"
              onChange={onPicked('playback.soundfont')}
            />
          </>
        )}
        <div className="ml-auto flex items-center">
          <button
            type="button"
            data-testid="shell-palette-button"
            onClick={() => openPalette('commands')}
            title={`Command palette (${formatShortcut('Mod+Shift+P')})`}
            className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100"
          >
            <Search size={13} aria-hidden="true" />
            <span className="hidden sm:inline">Search commands</span>
            <kbd className="hidden text-[10px] text-slate-400 sm:inline">
              {formatShortcut('Mod+Shift+P')}
            </kbd>
          </button>
        </div>
      </header>
      <CommandPalette registry={registry} />
      <CommandFormDialog registry={registry} />
      <ShortcutsDialog />
    </>
  );
}
