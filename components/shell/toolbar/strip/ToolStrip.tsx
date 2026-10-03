'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import React, { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { defaultCommandRegistry, type CommandRegistry } from '../../../../lib/commands/registry';
import { IconButton } from '../../../ui/IconButton';
import { TooltipProvider } from '../../../ui/Tooltip';
import styles from '../WriteToolbar.module.css';
import { useToolbarCommands } from '../useToolbarCommands';
import { ControlButton, type StripControlContext } from './ControlButton';
import { MenuButton } from './MenuButton';
import {
  getStripCollapsed,
  getStripCollapsedOnServer,
  subscribeStripCollapsed,
  writeStripCollapsed,
} from './stripPersistence';
import { flattenControls, STRIP_GROUPS, type StripGroup } from './toolbarLayout';

/** A group's left padding (1rem) plus its 1px divider: how far the row is shifted left so the first divider on a line is clipped. */
const DIVIDER_CLIP = 17;

/** Space between wrapped lines of buttons. */
const ROW_GAP = 8;

/**
 * The Write toolbar: the quick controls first, then every other ribbon control that has no button
 * elsewhere (SHELL_REDESIGN_DESIGN §23). One flowing toolbar with no scrollbar: the controls wrap onto
 * more lines as needed, and the toggle at the top right hides the tools, leaving the quick controls.
 * It owns no behaviour; each tool runs a command and reads its state from the registry. The tools are
 * one tab stop with arrow keys among them (roving tabindex).
 */
export function ToolStrip({
  children,
  groups = STRIP_GROUPS,
  registry = defaultCommandRegistry,
}: {
  /** The controls that come first and stay when the tools are hidden (the Write quick controls). */
  children?: React.ReactNode;
  groups?: readonly StripGroup[];
  registry?: CommandRegistry;
}) {
  const tools = useToolbarCommands(registry);
  const rowRef = useRef<HTMLDivElement>(null);
  const keys = useMemo(() => flattenControls(groups).map((control) => control.testId), [groups]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const collapsed = useSyncExternalStore(
    subscribeStripCollapsed,
    getStripCollapsed,
    getStripCollapsedOnServer,
  );
  const toggleCollapsed = () => writeStripCollapsed(!collapsed);

  const current = activeKey && keys.includes(activeKey) ? activeKey : (keys[0] ?? null);
  const move = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-strip-control]');
    if (!target) return;
    const index = keys.indexOf(target.dataset.stripControl ?? '');
    if (index < 0) return;
    const next =
      event.key === 'ArrowRight'
        ? Math.min(keys.length - 1, index + 1)
        : event.key === 'ArrowLeft'
          ? Math.max(0, index - 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? keys.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    rowRef.current
      ?.querySelector<HTMLElement>(`[data-strip-control="${CSS.escape(keys[next])}"]`)
      ?.focus();
  };

  const context: StripControlContext = { tools, activeKey: current, setActiveKey };

  return (
    <TooltipProvider delayDuration={500}>
      <div
        data-testid="tool-strip"
        data-collapsed={collapsed ? 'true' : 'false'}
        className={`${styles.root} flex shrink-0 items-start gap-1 border-b border-slate-200 bg-white px-3 py-1`}
      >
        {/* Each group carries a left divider; the row is shifted left and clipped so the divider of the first
            group on every line is cut off, and a wrapped line never starts with one. */}
        <div className="min-w-0 flex-1 overflow-x-clip py-0.5 pl-1">
          <div
            ref={rowRef}
            role="toolbar"
            aria-label="Write and tools"
            data-testid="tool-strip-row"
            onKeyDown={move}
            style={{ marginLeft: -DIVIDER_CLIP, rowGap: ROW_GAP }}
            className="flex min-w-0 flex-wrap items-center"
          >
            {children && (
              <div className="flex min-w-0 items-center border-l border-transparent pl-4">
                {children}
              </div>
            )}
            {!collapsed &&
              groups.map((group) => (
                <div
                  key={group.id}
                  role="group"
                  aria-label={group.label}
                  data-testid={`strip-group-${group.id}`}
                  className="flex shrink-0 items-center gap-1 border-l border-slate-200 pl-4 pr-1"
                >
                  {group.controls.map((control) =>
                    control.kind === 'menu' ? (
                      <MenuButton key={control.testId} control={control} context={context} />
                    ) : (
                      <ControlButton key={control.testId} control={control} context={context} />
                    ),
                  )}
                </div>
              ))}
          </div>
        </div>
        <IconButton
          label={collapsed ? 'Show tools' : 'Hide tools'}
          data-testid="btn-tool-strip-toggle"
          aria-expanded={!collapsed}
          className="shrink-0"
          onClick={toggleCollapsed}
        >
          {collapsed ? (
            <ChevronDown size={14} aria-hidden="true" />
          ) : (
            <ChevronUp size={14} aria-hidden="true" />
          )}
        </IconButton>
      </div>
    </TooltipProvider>
  );
}
