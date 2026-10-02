'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { defaultCommandRegistry, type CommandRegistry } from '../../lib/commands/registry';
import { useCommandContext } from '../../lib/commands/useRegisterCommands';
import { invokeCommand } from './invokeCommand';
import { buildMenuPathIndex } from './menus';
import {
  describeNavigationTarget,
  parseNavigationQuery,
  type NavigationTarget,
} from './navigationQuery';
import {
  buildPaletteRows,
  readPaletteRecents,
  rememberPaletteRecent,
  searchPaletteRows,
  type PaletteRow,
} from './paletteSearch';
import { formatShortcut } from './shortcutDisplay';
import { closePalette, getShellUiState, subscribeToShellUi } from './shellStore';

/** What a row in the list does when chosen. */
type ListEntry =
  { kind: 'command'; row: PaletteRow } | { kind: 'navigate'; target: NavigationTarget };

const NAVIGATION_COMMAND: Record<NavigationTarget['kind'], string> = {
  bar: 'view.goto.bar',
  page: 'view.goto.page',
  rehearsal: 'view.goto.rehearsal',
};

const navigationArg = (target: NavigationTarget): number | string =>
  target.kind === 'bar' ? target.bar : target.kind === 'page' ? target.page : target.mark;

function PaletteBody({ registry, mode }: { registry: CommandRegistry; mode: 'commands' | 'goto' }) {
  const ctx = useCommandContext(registry);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Built once per opening: enabled-ness is read when the palette opens, not per keystroke.
  const rows = useMemo(
    () =>
      buildPaletteRows(
        registry,
        ctx,
        buildMenuPathIndex(undefined, (id) => {
          const entry = registry.get(id) as { label?: string } | undefined;
          return entry?.label;
        }),
      ),
    // `ctx` changes identity only when a field does; rebuilding then is the point.
    [registry, ctx],
  );
  const recents = useMemo(() => readPaletteRecents(), []);

  const entries: ListEntry[] = useMemo(() => {
    const target = parseNavigationQuery(query, { gotoMode: mode === 'goto' });
    const navigate: ListEntry[] = target ? [{ kind: 'navigate', target }] : [];
    if (mode === 'goto') return navigate;

    if (query.trim() === '') {
      const byKey = new Map(rows.map((row) => [row.key, row]));
      const recent = recents
        .map((key) => byKey.get(key))
        .filter((row): row is PaletteRow => Boolean(row));
      const rest = rows.filter((row) => !recent.includes(row)).slice(0, 60);
      return [...recent, ...rest].map((row) => ({ kind: 'command' as const, row }));
    }
    const matches = searchPaletteRows(rows, query).map((row) => ({
      kind: 'command' as const,
      row,
    }));
    // `m12` is rarely also a command, so navigation leads; `rA` shares letters with words
    // like "repeat", so a command that matches keeps the top spot.
    return target?.kind === 'rehearsal' && matches.length > 0
      ? [...matches, ...navigate]
      : [...navigate, ...matches];
  }, [mode, query, recents, rows]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const choose = (entry: ListEntry | undefined) => {
    if (!entry) return;
    if (entry.kind === 'navigate') {
      closePalette();
      void invokeCommand(
        NAVIGATION_COMMAND[entry.target.kind],
        navigationArg(entry.target),
        registry,
      );
      return;
    }
    if (!entry.row.enabled) return;
    rememberPaletteRecent(entry.row.key);
    closePalette();
    void invokeCommand(entry.row.commandId, entry.row.arg, registry);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(entries.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(entries[active]);
    }
  };

  return (
    <>
      <DialogPrimitive.Title className="sr-only">
        {mode === 'goto' ? 'Go to' : 'Command palette'}
      </DialogPrimitive.Title>
      <DialogPrimitive.Description className="sr-only">
        {mode === 'goto'
          ? 'Type a bar number, m125, rA for a rehearsal mark, or p3 for a page.'
          : 'Search every command. Start with m125, rA or p3 to jump within the score.'}
      </DialogPrimitive.Description>
      <input
        autoFocus
        role="combobox"
        aria-expanded="true"
        aria-controls="command-palette-list"
        aria-activedescendant={entries.length > 0 ? `palette-option-${active}` : undefined}
        data-testid="palette-input"
        value={query}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        placeholder={
          mode === 'goto'
            ? 'Go to bar (m125), rehearsal mark (rA) or page (p3)…'
            : 'Type a command, or m125 / rA / p3 to jump…'
        }
        className="w-full border-b border-slate-200 bg-transparent px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
      />
      <div
        id="command-palette-list"
        ref={listRef}
        role="listbox"
        aria-label="Commands"
        className="max-h-[50vh] overflow-y-auto p-1"
      >
        {entries.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-slate-500" data-testid="palette-empty">
            {mode === 'goto' ? 'Type a bar, rehearsal mark or page.' : 'No matching commands.'}
          </div>
        )}
        {entries.map((entry, index) => {
          const selected = index === active;
          const disabled = entry.kind === 'command' && !entry.row.enabled;
          return (
            <div
              key={entry.kind === 'command' ? entry.row.key : `go-${entry.target.kind}`}
              id={`palette-option-${index}`}
              role="option"
              aria-selected={selected}
              aria-disabled={disabled || undefined}
              data-index={index}
              data-testid={entry.kind === 'command' ? 'palette-row' : 'palette-navigate'}
              data-command-id={entry.kind === 'command' ? entry.row.commandId : undefined}
              onMouseMove={() => setActive(index)}
              onClick={() => choose(entry)}
              className={`flex cursor-pointer items-center justify-between gap-4 rounded px-3 py-1.5 text-sm ${
                selected ? 'bg-blue-50' : ''
              } ${disabled ? 'cursor-default text-slate-400' : 'text-slate-900'}`}
            >
              {entry.kind === 'navigate' ? (
                <span>{describeNavigationTarget(entry.target)}</span>
              ) : (
                <>
                  <span className="min-w-0">
                    <span className="block truncate">{entry.row.title}</span>
                    {entry.row.path && (
                      <span className="block truncate text-[11px] text-slate-400">
                        {entry.row.path}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {disabled ? 'Unavailable' : formatShortcut(entry.row.shortcut)}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/**
 * The command palette (SHELL_REDESIGN_DESIGN §8.5): fuzzy search over every registered
 * command, plus the `m125` / `rA` / `p3` navigation grammar. Opened by the shell store
 * (Mod+Shift+P, the header button, View ▸ Go to).
 */
export function CommandPalette({
  registry = defaultCommandRegistry,
}: {
  registry?: CommandRegistry;
}) {
  const palette = useSyncExternalStore(
    subscribeToShellUi,
    () => getShellUiState().palette,
    () => getShellUiState().palette,
  );

  return (
    <DialogPrimitive.Root open={palette.open} onOpenChange={(open) => !open && closePalette()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-palette bg-black/30" />
        <DialogPrimitive.Content
          data-testid="command-palette"
          className="fixed left-1/2 top-[12vh] z-palette w-[36rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-modal outline-none"
        >
          {/* Keyed by mode so reopening in the other mode starts clean. */}
          <PaletteBody key={palette.mode} registry={registry} mode={palette.mode} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
