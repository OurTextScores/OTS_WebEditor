'use client';

import React, { type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';

/**
 * The Compare mode toolbar (SHELL_REDESIGN_DESIGN §8.2): which two scores are on screen, the
 * assistant's Apply All / Send Feedback when the session is an AI proposal, and Close. The
 * controls that belong to one pane stay in that pane.
 */
export function CompareToolbar({
  leftLabel,
  rightLabel,
  actions,
  closeLabel,
  onClose,
  gutterCollapsed,
  onToggleGutter,
}: {
  leftLabel: string;
  rightLabel: string;
  /** Session-specific actions, left of Close. */
  actions?: ReactNode;
  closeLabel: string;
  onClose: () => void;
  /** The gutter between the panes; omit both to hide the toggle. */
  gutterCollapsed?: boolean;
  onToggleGutter?: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Compare"
      data-testid="compare-toolbar"
      className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-1"
    >
      <div className="min-w-0">
        <span className="text-sm font-semibold text-slate-800">Compare Scores</span>
        <span className="ml-3 truncate text-xs text-slate-500">
          {leftLabel} vs {rightLabel}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {onToggleGutter && (
          <IconButton
            data-testid="compare-gutter-toggle"
            label={gutterCollapsed ? 'Show comparison gutter' : 'Hide comparison gutter'}
            aria-pressed={!gutterCollapsed}
            onClick={onToggleGutter}
          >
            {gutterCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
            ) : (
              <PanelLeftClose className="h-4 w-4" aria-hidden />
            )}
          </IconButton>
        )}
        <button
          type="button"
          data-testid="compare-close"
          onClick={onClose}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          {closeLabel}
        </button>
      </div>
    </div>
  );
}
