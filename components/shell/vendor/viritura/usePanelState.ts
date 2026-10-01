/**
 * Vendored from Viritura (https://github.com/viritura, commit cab0def), MIT License,
 * Copyright (c) 2026 Viritura contributors. Modified for OTS_Web: opaque surfaces on the shell
 * tokens instead of glass, a landmark role, test-id props, and no status-zone (OTS has its own
 * StatusBar). See THIRD_PARTY_NOTICES.md at the repository root.
 */
import { useCallback, useState } from 'react';

export interface PanelStateOptions {
  /** localStorage key root. Width persists at `key`, collapsed at `key:collapsed`. */
  storageKey: string;
  defaultWidth: number;
  min: number;
  max: number;
  /** Initial collapsed state when none has been stored. Defaults to false. */
  defaultCollapsed?: boolean;
}

export interface PanelState {
  width: number;
  setWidth: (width: number) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

/**
 * Width and collapsed state for one docked panel, persisted in localStorage. Values are
 * clamped on read, so corrupt storage cannot break the panel, and every storage access is
 * guarded: the panel works without it.
 */
export function usePanelState({
  storageKey,
  defaultWidth,
  min,
  max,
  defaultCollapsed = false,
}: PanelStateOptions): PanelState {
  const widthKey = storageKey;
  const collapsedKey = `${storageKey}:collapsed`;

  const [width, setWidthRaw] = useState<number>(() => {
    try {
      const stored = window.localStorage.getItem(widthKey);
      const parsed = stored ? Number(stored) : Number.NaN;
      return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : defaultWidth;
    } catch {
      return defaultWidth;
    }
  });

  const [collapsed, setCollapsedRaw] = useState<boolean>(() => {
    try {
      const raw = window.localStorage.getItem(collapsedKey);
      return raw === null ? defaultCollapsed : raw === '1';
    } catch {
      return defaultCollapsed;
    }
  });

  const setWidth = useCallback(
    (next: number) => {
      const clamped = Math.max(min, Math.min(max, next));
      setWidthRaw(clamped);
      try {
        window.localStorage.setItem(widthKey, String(clamped));
      } catch {
        // Not remembering a width is not worth failing a resize.
      }
    },
    [min, max, widthKey],
  );

  const setCollapsed = useCallback(
    (next: boolean) => {
      setCollapsedRaw(next);
      try {
        window.localStorage.setItem(collapsedKey, next ? '1' : '0');
      } catch {
        // As above.
      }
    },
    [collapsedKey],
  );

  return { width, setWidth, collapsed, setCollapsed };
}
