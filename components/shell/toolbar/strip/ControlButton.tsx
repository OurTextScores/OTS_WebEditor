'use client';

import React from 'react';
import styles from '../WriteToolbar.module.css';
import { Button } from '../../../ui/Button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../ui/Tooltip';
import { announce } from '../../announcer';
import { formatShortcut } from '../../shortcutDisplay';
import type { ToolbarCommands } from '../useToolbarCommands';
import type { StripCommand, StripMenu } from './toolbarLayout';

/** What every strip control gets from the strip: the registry's view, and its place in the roving tab order. */
export interface StripControlContext {
  readonly tools: ToolbarCommands;
  readonly activeKey: string | null;
  readonly setActiveKey: (key: string) => void;
}

/**
 * Disabled controls stay focusable and say why (aria-disabled, not `disabled`), so a keyboard or
 * screen-reader user can find them and learn what to select. The look is forced because `Button`'s
 * disabled styles hang off the `:disabled` pseudo-class.
 */
export const DISABLED_LOOK =
  'bg-slate-200! text-slate-700! border-slate-300! cursor-not-allowed hover:bg-slate-200!';

/** The label with its shortcut, and why the control is unavailable when it is. */
export function ControlTip({
  label,
  shortcut,
  reason,
}: {
  label: string;
  shortcut?: string;
  reason?: string;
}) {
  return (
    <span className="flex flex-col gap-0.5">
      <span>
        {label}
        {shortcut ? <span className="ml-2 opacity-70">{formatShortcut(shortcut)}</span> : null}
      </span>
      {reason ? <span className="opacity-80">{reason}</span> : null}
    </span>
  );
}

/** Tells a screen-reader user why nothing happened. */
export const announceUnavailable = (label: string, reason: string | undefined) =>
  announce(reason ? `${label}: ${reason}` : `${label} is not available`);

/** A button that runs one command, or toggles one (it has a pressed state when the command does). */
export function ControlButton({
  control,
  context,
}: {
  control: StripCommand;
  context: StripControlContext;
}) {
  const { tools, activeKey, setActiveKey } = context;
  const Icon = control.icon;
  const enabled = tools.enabled(control.commandId);
  const toggles = tools.toggles(control.commandId);
  const pressed = toggles ? tools.checked(control.commandId) : undefined;
  const reason = enabled ? undefined : tools.reason(control.commandId);
  const shortcut = tools.shortcut(control.commandId, control.arg);
  const run = tools.run(control.commandId, control.arg);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-testid={control.testId}
          data-strip-control={control.testId}
          variant={pressed ? 'primary' : 'outline'}
          size="xs"
          className={`h-8 w-8 px-0 ${enabled ? '' : DISABLED_LOOK}`}
          aria-label={control.label}
          aria-pressed={pressed}
          aria-disabled={enabled ? undefined : true}
          tabIndex={activeKey === control.testId ? 0 : -1}
          onFocus={() => setActiveKey(control.testId)}
          onClick={() => (enabled ? run() : announceUnavailable(control.label, reason))}
        >
          {control.glyph ? (
            <span className={styles.glyph} aria-hidden="true">
              {control.glyph}
            </span>
          ) : (
            <Icon size={16} aria-hidden="true" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <ControlTip label={control.label} shortcut={shortcut} reason={reason} />
      </TooltipContent>
    </Tooltip>
  );
}

export type { StripMenu };
