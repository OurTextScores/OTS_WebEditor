'use client';

import React, { type ReactNode } from 'react';

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
}: {
  leftLabel: string;
  rightLabel: string;
  /** Session-specific actions, left of Close. */
  actions?: ReactNode;
  closeLabel: string;
  onClose: () => void;
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
