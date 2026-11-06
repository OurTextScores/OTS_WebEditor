'use client';

import React, { useState } from 'react';
import { Announcer } from '../../shell/announcer';
import { EditsPanel } from '../../shell/EditsPanel';
import { Button } from '../../ui/Button';
import type { MarksHistory } from './annotationHistory';

/**
 * The marks' history, as the editor's Edits panel: every change this session, newest first; a row goes back (or
 * forward) to it. Opened from the annotation tools.
 */
export function MarksHistoryPanel({
  history,
  onUndo,
  onRedo,
  onJump,
}: {
  history: MarksHistory;
  onUndo: () => void;
  onRedo: () => void;
  onJump: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <Button
        type="button"
        size="sm"
        aria-expanded={open}
        data-testid="annotate-history"
        onClick={() => setOpen(!open)}
      >
        History
      </Button>
      {open && (
        <div
          data-testid="annotate-history-panel"
          className="absolute right-0 top-12 z-20 flex max-h-96 w-72 flex-col rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <EditsPanel
            entries={history.steps}
            index={history.index}
            canUndo={history.index > 0}
            canRedo={history.index < history.steps.length}
            onUndo={onUndo}
            onRedo={onRedo}
            onJump={onJump}
          />
          <Announcer />
        </div>
      )}
    </span>
  );
}
