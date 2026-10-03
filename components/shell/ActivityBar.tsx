'use client';

import type { LucideIcon } from 'lucide-react';
import React, { useRef, useSyncExternalStore } from 'react';
import { defaultCommandRegistry, type CommandRegistry } from '../../lib/commands/registry';
import { ACTIVITIES, PANEL_TOGGLES } from './activities';
import { invokeCommand } from './invokeCommand';
import { getShellUiState, subscribeToShellUi } from './shellStore';
import { useToolbarCommands } from './toolbar/useToolbarCommands';
import type { OtsActiveActivity } from './workspaceMode';

/**
 * What the user is doing: Write, Compare or History. A vertical strip of icon buttons with
 * the current one pressed; each runs its `shell.activity.*` command, so the palette and the
 * menus reach the same switches. Below a divider are the panel toggles (AI Tools, Score source),
 * each pressed while its panel is open. Arrow keys move focus along the whole strip.
 */
export function ActivityBar({
  active,
  registry = defaultCommandRegistry,
}: {
  active: OtsActiveActivity;
  registry?: CommandRegistry;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const tools = useToolbarCommands(registry);
  // Whether a panel is open comes from the editor's published view, which changes whenever the
  // panel does, however it was closed (its own X as well as this button): a command's `checked`
  // is only read when something else re-renders the bar.
  const { view } = useSyncExternalStore(subscribeToShellUi, getShellUiState, getShellUiState);
  const total = ACTIVITIES.length + PANEL_TOGGLES.length;

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + total) % total;
    buttons.current[next]?.focus();
  };

  return (
    <nav
      aria-label="Activities"
      data-testid="activity-bar"
      className="flex shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-white py-2"
      style={{ width: 'var(--shell-activity-w, 44px)', zIndex: 'var(--ots-z-activity)' }}
    >
      {ACTIVITIES.map(({ id, label, icon, commandId }, index) => (
        <BarButton
          key={id}
          testId={`activity-${id}`}
          label={label}
          icon={icon}
          pressed={active === id}
          disabled={!registry.has(commandId)}
          register={(element) => {
            buttons.current[index] = element;
          }}
          onClick={() => void invokeCommand(commandId, undefined, registry)}
          onKeyDown={(event) => onKeyDown(event, index)}
        />
      ))}
      <span aria-hidden="true" className="my-1 h-px w-6 shrink-0 bg-slate-200" />
      {PANEL_TOGGLES.map(({ id, label, icon, commandId, openKey }, offset) => {
        const index = ACTIVITIES.length + offset;
        return (
          <BarButton
            key={id}
            testId={`panel-${id}`}
            label={label}
            icon={icon}
            pressed={view[openKey]}
            disabled={!registry.has(commandId) || !tools.enabled(commandId)}
            register={(element) => {
              buttons.current[index] = element;
            }}
            onClick={() => void invokeCommand(commandId, undefined, registry)}
            onKeyDown={(event) => onKeyDown(event, index)}
          />
        );
      })}
    </nav>
  );
}

/** One icon button of the bar: named for assistive tech, pressed while its activity or panel is on. */
function BarButton({
  testId,
  label,
  icon: Icon,
  pressed,
  disabled,
  register,
  onClick,
  onKeyDown,
}: {
  testId: string;
  label: string;
  icon: LucideIcon;
  pressed: boolean;
  disabled: boolean;
  register: (element: HTMLButtonElement | null) => void;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}) {
  return (
    <button
      ref={register}
      type="button"
      data-testid={testId}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`flex h-9 w-9 items-center justify-center rounded text-slate-600 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-accent ${
        pressed ? 'bg-accent-soft text-accent' : ''
      }`}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
