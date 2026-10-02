'use client';

import {
  Bell,
  ChevronLeft,
  ChevronRight,
  MoveHorizontal,
  MoveVertical,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { defaultCommandRegistry, type CommandRegistry } from '../../lib/commands/registry';
import { useCommandContext, useRegisterCommands } from '../../lib/commands/useRegisterCommands';
import { zoomPresets } from '../toolbar/constants';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import { invokeCommand } from './invokeCommand';
import { buildStatusBarCommands } from './shellCommands';
import { getNoticeSnapshot, markAllNoticesRead, subscribeToNotices, type Notice } from './notices';
import { getShellUiState, subscribeToShellUi } from './shellStore';

const buttonClass =
  'inline-flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

const divider = <span aria-hidden="true" className="mx-1 h-4 w-px bg-slate-200" />;

const kindDot: Record<Notice['kind'], string> = {
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-slate-400',
  success: 'bg-emerald-500',
};

function NoticeList() {
  const { notices, unreadCount } = useSyncExternalStore(
    subscribeToNotices,
    getNoticeSnapshot,
    getNoticeSnapshot,
  );
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Seen once the list has been opened, not before.
        if (next) markAllNoticesRead();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="status-notices"
          className={buttonClass}
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          title="Notifications"
        >
          <Bell size={13} aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              data-testid="status-notices-count"
              className="ml-1 rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-4 text-white"
            >
              {unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        data-testid="notice-list"
        className="relative z-menu max-h-72 w-80 overflow-y-auto p-1"
      >
        {notices.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-slate-500">No notifications.</div>
        ) : (
          [...notices].reverse().map((notice) => (
            <div key={notice.id} className="flex gap-2 rounded px-2 py-1.5 text-xs">
              <span
                aria-hidden="true"
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${kindDot[notice.kind]}`}
              />
              <div className="min-w-0">
                <div className="font-medium text-slate-900">{notice.title}</div>
                {notice.detail && <div className="break-words text-slate-500">{notice.detail}</div>}
              </div>
            </div>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The status bar (SHELL_REDESIGN_DESIGN §8.4): page and zoom controls, layout progress, the
 * checkpoint dot and the notice list. It owns no behaviour — every control runs a command —
 * and reads what it shows from the view state `ScoreEditor` publishes.
 *
 * Pinned by default. View ▸ Status Bar unpins it, and it then peeks while the pointer is at
 * the bottom edge.
 */
export function StatusBar({ registry = defaultCommandRegistry }: { registry?: CommandRegistry }) {
  const ui = useSyncExternalStore(subscribeToShellUi, getShellUiState, getShellUiState);
  const { view, statusBarPinned } = ui;
  const ctx = useCommandContext(registry);
  const [peeking, setPeeking] = useState(false);

  const commands = useMemo(() => buildStatusBarCommands(), []);
  useRegisterCommands('global', commands, registry);

  const enabled = (id: string) => registry.isEnabled(id, ctx);
  const run = (id: string, arg?: unknown) => () => void invokeCommand(id, arg, registry);
  const hasPages = view.hasScore && view.pageCount > 0;
  const atEnd = view.currentPage >= view.pageCount - 1 && !view.pageCountIsFloor;

  const bar = (
    <footer
      role="contentinfo"
      data-testid="status-bar"
      className="flex shrink-0 items-center gap-1 border-t border-slate-200 bg-white px-3 text-xs text-slate-600"
      // Below the ribbon (z 100): its dropdowns render inline, inside that stacking context, so
      // a status bar above it would sit on top of the end of any tall menu.
      style={{ height: 'var(--shell-status-h, 32px)', zIndex: 'var(--ots-z-status)' }}
    >
      <button
        type="button"
        className={buttonClass}
        aria-label="Previous page"
        title="Previous page"
        disabled={!hasPages || view.currentPage <= 0 || !enabled('view.goto.prevPage')}
        onClick={run('view.goto.prevPage')}
      >
        <ChevronLeft size={14} aria-hidden="true" />
      </button>
      <select
        aria-label="Page"
        data-testid="page-select"
        value={view.currentPage}
        disabled={!hasPages}
        onChange={(event) =>
          void invokeCommand('view.goto.page', Number(event.target.value) + 1, registry)
        }
        className="h-6 rounded border border-slate-200 bg-white px-1 text-xs text-slate-700"
      >
        {Array.from({ length: view.pageCount }, (_, index) => (
          <option key={index} value={index}>
            Page {index + 1}
          </option>
        ))}
      </select>
      <span data-testid="page-indicator" className="tabular-nums">
        of {view.pageCountIsFloor ? `${view.pageCount}+` : view.pageCount}
      </span>
      <button
        type="button"
        className={buttonClass}
        aria-label="Next page"
        title="Next page"
        disabled={!hasPages || atEnd || !enabled('view.goto.nextPage')}
        onClick={run('view.goto.nextPage')}
      >
        <ChevronRight size={14} aria-hidden="true" />
      </button>

      {divider}

      <button
        type="button"
        data-testid="btn-fit-width"
        className={buttonClass}
        aria-label="Fit width"
        title="Fit width"
        disabled={!enabled('view.zoom.fitWidth')}
        onClick={run('view.zoom.fitWidth')}
      >
        <MoveHorizontal size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        data-testid="btn-fit-height"
        className={buttonClass}
        aria-label="Fit height"
        title="Fit height"
        disabled={!enabled('view.zoom.fitHeight')}
        onClick={run('view.zoom.fitHeight')}
      >
        <MoveVertical size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        data-testid="btn-zoom-out"
        className={buttonClass}
        aria-label="Zoom out"
        title="Zoom out"
        onClick={run('view.zoom.out')}
      >
        <ZoomOut size={14} aria-hidden="true" />
      </button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-testid="zoom-preset-trigger"
            title="Set zoom level (remembered per score)"
            className="min-w-[2.75rem] rounded px-1.5 py-0.5 text-center text-[11px] font-bold text-slate-700 hover:bg-slate-100"
          >
            {(view.zoom * 100).toFixed(0)}%
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" className="relative z-menu">
          {zoomPresets.map((preset) => (
            <DropdownMenuItem
              key={preset}
              data-testid={`zoom-preset-${Math.round(preset * 100)}`}
              disabled={!enabled('view.zoom.preset')}
              onSelect={run('view.zoom.preset', preset)}
            >
              {Math.round(preset * 100)}%
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            data-testid="zoom-preset-fit-width"
            disabled={!enabled('view.zoom.fitWidth')}
            onSelect={run('view.zoom.fitWidth')}
          >
            Fit width
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="zoom-preset-fit-height"
            disabled={!enabled('view.zoom.fitHeight')}
            onSelect={run('view.zoom.fitHeight')}
          >
            Fit height
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        data-testid="btn-zoom-in"
        className={buttonClass}
        aria-label="Zoom in"
        title="Zoom in"
        onClick={run('view.zoom.in')}
      >
        <ZoomIn size={14} aria-hidden="true" />
      </button>

      {view.preparing && (
        <>
          {divider}
          <span
            data-testid="interaction-preparing-banner"
            role="status"
            title="Viewing and page playback are available. Note selection, editing and selection playback unlock when relayout finishes."
            className="rounded bg-amber-50 px-2 py-0.5 text-amber-800"
          >
            Finalizing layout…
          </span>
        </>
      )}

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          data-testid="status-progressive-load"
          className={buttonClass}
          aria-pressed={view.progressiveLoadEnabled}
          title="Progressive load applies to future score loads"
          onClick={run('view.progressiveLoad')}
        >
          Progressive load: {view.progressiveLoadEnabled ? 'On' : 'Off'}
        </button>
        {divider}
        <button
          type="button"
          data-testid="status-checkpoint"
          className={buttonClass}
          title={
            view.dirty
              ? 'Changes since the last checkpoint. Open History.'
              : `${view.checkpointCount} checkpoint${view.checkpointCount === 1 ? '' : 's'}. Open History.`
          }
          onClick={run('view.panel.history')}
        >
          <span
            aria-hidden="true"
            className={`mr-1.5 h-2 w-2 rounded-full ${view.dirty ? 'bg-amber-500' : 'bg-emerald-500'}`}
          />
          {view.dirty
            ? 'Unsaved changes'
            : view.checkpointCount === 0
              ? 'No checkpoint'
              : 'Checkpointed'}
        </button>
        <NoticeList />
      </div>
    </footer>
  );

  if (statusBarPinned) return bar;

  // Unpinned: a hairline at the bottom edge that reveals the bar while the pointer is on it.
  return (
    <div
      data-testid="status-bar-peek"
      className="relative h-1 shrink-0"
      onMouseEnter={() => setPeeking(true)}
      onMouseLeave={() => setPeeking(false)}
    >
      {peeking && <div className="absolute bottom-0 left-0 right-0">{bar}</div>}
    </div>
  );
}
