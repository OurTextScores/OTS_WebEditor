'use client';

import { ArrowLeft } from 'lucide-react';
import React from 'react';
import { defaultCommandRegistry, type CommandRegistry } from '../../../lib/commands/registry';
import { Button } from '../../ui/Button';
import { useToolbarCommands } from './useToolbarCommands';

/**
 * The History mode toolbar: says the score is read-only while looking back, and returns to
 * Write. Refresh, filtering and the branch picker live in the History panel's own tabs.
 */
export function HistoryToolbar({
  registry = defaultCommandRegistry,
}: {
  registry?: CommandRegistry;
}) {
  const { run } = useToolbarCommands(registry);
  return (
    <div
      role="toolbar"
      aria-label="History"
      data-testid="history-toolbar"
      className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 py-1"
    >
      <span className="text-xs text-slate-500">
        Viewing history: the score is read-only here. Compare a checkpoint, or restore one into the
        editor.
      </span>
      <Button
        data-testid="btn-history-back-to-write"
        variant="outline"
        size="xs"
        onClick={run('shell.activity.write')}
      >
        <ArrowLeft size={13} className="mr-1" aria-hidden="true" />
        Back to Write
      </Button>
    </div>
  );
}
