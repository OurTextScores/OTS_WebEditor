'use client';

import { Search } from 'lucide-react';
import React, { useMemo, useSyncExternalStore } from 'react';
import { defaultCommandRegistry, type CommandRegistry } from '../../lib/commands/registry';
import { useRegisterCommands } from '../../lib/commands/useRegisterCommands';
import { CommandFormDialog } from './CommandFormDialog';
import { CommandPalette } from './CommandPalette';
import { MenuBar } from './MenuBar';
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
  registry = defaultCommandRegistry,
}: {
  title: string;
  dirty: boolean;
  registry?: CommandRegistry;
}) {
  const ownCommands = useMemo(() => buildShellOwnCommands(), []);
  useRegisterCommands('global', ownCommands, registry);
  useShellShortcuts(registry);
  const compact = useCompact();

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
