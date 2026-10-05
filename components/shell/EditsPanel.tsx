'use client';

import { Redo2, Undo2 } from 'lucide-react';
import React from 'react';
import type { HistoryEntry } from '../score-editor/undoHistory';
import { Button } from '../ui/Button';
import { announce } from './announcer';

export interface EditsPanelProps {
  /** Oldest first. */
  entries: readonly HistoryEntry[];
  /** Entries applied: 0 is the loaded score. */
  index: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Moves the score to `index` entries applied. */
  onJump: (index: number) => void;
}

/**
 * The undo history (docs/private/UNDO_HISTORY_PANEL_DESIGN_2026-10-04.md): every edit, newest first, the
 * current one marked, the ones that Redo would bring back dimmed. A row jumps there; the bottom row is the score
 * as it was loaded. Arrow keys move between rows and Enter jumps.
 */
export function EditsPanel({
  entries,
  index,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onJump,
}: EditsPanelProps) {
  // Newest first, then "Original": `target` is the number of entries applied once the row is chosen.
  const rows = [
    ...entries.map((entry, position) => ({ entry, target: position + 1 })).reverse(),
    { entry: { id: 0, description: 'Original' } as HistoryEntry, target: 0 },
  ];

  const jump = (row: (typeof rows)[number]) => {
    if (row.target === index) return;
    onJump(row.target);
    announce(
      row.target < index
        ? `Back to: ${row.entry.description}`
        : `Forward to: ${row.entry.description}`,
    );
  };

  const move = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-edit-row]')];
    const at = buttons.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === 'ArrowDown' ? Math.min(buttons.length - 1, at + 1) : Math.max(0, at - 1);
    event.preventDefault();
    buttons[next]?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="edits-panel">
      <div className="flex shrink-0 items-center gap-1 px-3 py-2">
        <Button
          variant="outline"
          size="xs"
          data-testid="edits-undo"
          disabled={!canUndo}
          onClick={onUndo}
          className="gap-1"
        >
          <Undo2 size={13} aria-hidden="true" />
          Undo
        </Button>
        <Button
          variant="outline"
          size="xs"
          data-testid="edits-redo"
          disabled={!canRedo}
          onClick={onRedo}
          className="gap-1"
        >
          <Redo2 size={13} aria-hidden="true" />
          Redo
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="px-3 py-2 text-sm text-slate-500" data-testid="edits-empty">
          No edits yet.
        </p>
      ) : (
        <ol
          aria-label="Edits, newest first"
          onKeyDown={move}
          className="min-h-0 flex-1 overflow-y-auto px-1 pb-2"
        >
          {rows.map((row) => {
            const current = row.target === index;
            const future = row.target > index;
            return (
              <li key={`${row.entry.id}-${row.target}`}>
                <Button
                  variant="quiet"
                  data-edit-row=""
                  data-testid={`edit-row-${row.target}`}
                  // Left-aligned: Button centres its content, and the utility that undoes that is not generated reliably.
                  style={{ justifyContent: 'flex-start' }}
                  aria-current={current ? 'step' : undefined}
                  onClick={() => jump(row)}
                  className={`h-auto w-full px-2 py-1 text-left text-sm font-normal ${
                    current
                      ? 'bg-surface-hover font-semibold text-slate-900'
                      : future
                        ? 'text-slate-500'
                        : 'text-slate-700'
                  }`}
                >
                  <span className="min-w-0 truncate">{row.entry.description}</span>
                </Button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
