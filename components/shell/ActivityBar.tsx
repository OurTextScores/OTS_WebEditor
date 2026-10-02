'use client';

import React, { useRef } from 'react';
import { defaultCommandRegistry, type CommandRegistry } from '../../lib/commands/registry';
import { ACTIVITIES } from './activities';
import { invokeCommand } from './invokeCommand';
import type { OtsActiveActivity } from './workspaceMode';

/**
 * What the user is doing: Write, Compare or History. A vertical strip of icon buttons with
 * the current one pressed; each runs its `shell.activity.*` command, so the palette and the
 * menus reach the same switches. Arrow keys move focus along the strip.
 */
export function ActivityBar({
  active,
  registry = defaultCommandRegistry,
}: {
  active: OtsActiveActivity;
  registry?: CommandRegistry;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + ACTIVITIES.length) % ACTIVITIES.length;
    buttons.current[next]?.focus();
  };

  return (
    <nav
      aria-label="Activities"
      data-testid="activity-bar"
      className="flex shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-white py-2"
      style={{ width: 'var(--shell-activity-w, 44px)', zIndex: 'var(--ots-z-activity)' }}
    >
      {ACTIVITIES.map(({ id, label, icon: Icon, commandId }, index) => {
        const pressed = active === id;
        return (
          <button
            key={id}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            data-testid={`activity-${id}`}
            aria-pressed={pressed}
            aria-label={label}
            title={label}
            disabled={!registry.has(commandId)}
            onClick={() => void invokeCommand(commandId, undefined, registry)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`flex h-9 w-9 items-center justify-center rounded text-slate-600 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-accent ${
              pressed ? 'bg-accent-soft text-accent' : ''
            }`}
          >
            <Icon size={18} aria-hidden="true" />
          </button>
        );
      })}
    </nav>
  );
}
