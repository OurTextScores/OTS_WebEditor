'use client';

import { useEffect, useRef } from 'react';
import { announce } from './announcerStore';
import {
  SELECTION_CLEARED,
  describeSelection,
  type SelectionSummary,
} from './selectionAnnouncement';

/** Quiet for this long before a selection is announced, so a drag across notes says one thing. */
export const SELECTION_ANNOUNCE_DELAY_MS = 250;

/**
 * Announces the selection when it changes. The first state (nothing selected) is silent, and
 * clearing is only announced when something was selected before.
 */
export function useSelectionAnnouncer(summary: SelectionSummary | null): void {
  const previous = useRef<string | null>(null);
  const type = summary?.elementType ?? null;
  const count = summary?.selectionCount ?? 0;

  useEffect(() => {
    const message = describeSelection(
      type === null ? null : { elementType: type, selectionCount: count },
    );
    const timer = window.setTimeout(() => {
      if (message === previous.current) return;
      if (message === null) {
        if (previous.current !== null) announce(SELECTION_CLEARED);
      } else {
        announce(message);
      }
      previous.current = message;
    }, SELECTION_ANNOUNCE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [type, count]);
}
