'use client';

import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { defaultCommandRegistry, type CommandRegistry } from '../../../lib/commands/registry';
import { useCommandContext } from '../../../lib/commands/useRegisterCommands';
import { ACTIVITIES } from '../activities';
import { announce, getAnnouncement, subscribeToAnnouncements } from './announcerStore';
import { describeMode } from './selectionAnnouncement';

/**
 * The one polite live region (docs/private/DESIGN_LANGUAGE.md §6). Mounted once, next to the
 * notice host; it also announces a switch between Write, Compare and History.
 */
export function Announcer({ registry = defaultCommandRegistry }: { registry?: CommandRegistry }) {
  const message = useSyncExternalStore(subscribeToAnnouncements, getAnnouncement, getAnnouncement);
  const { mode } = useCommandContext(registry);
  const previousMode = useRef(mode);

  useEffect(() => {
    if (previousMode.current === mode) return;
    previousMode.current = mode;
    const label = ACTIVITIES.find((activity) => activity.id === mode)?.label;
    if (label) announce(describeMode(label));
  }, [mode]);

  return (
    <div
      data-testid="announcer"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {/* The key makes a repeated message a new node, which is what gets it read again. */}
      <span key={message.id}>{message.text}</span>
    </div>
  );
}
