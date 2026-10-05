import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PaletteCategory } from '../toolbar/palette';

export type DockTab = 'palettes' | 'instruments' | 'properties' | 'edits';

interface DockState {
  readonly open: boolean;
  readonly tab: DockTab;
  /** Palettes float over the canvas (today's overlay) instead of docking in the left panel. */
  readonly poppedOut: boolean;
}

const KEY = 'ots.shell.dock';
const DEFAULT: DockState = { open: true, tab: 'palettes', poppedOut: false };

const isTab = (value: unknown): value is DockTab =>
  value === 'palettes' || value === 'instruments' || value === 'properties' || value === 'edits';

/** Corrupt or blocked storage falls back to the default rather than breaking the editor. */
export function readDockState(): DockState {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return DEFAULT;
    const { open, tab, poppedOut } = parsed as Partial<Record<keyof DockState, unknown>>;
    return {
      open: typeof open === 'boolean' ? open : DEFAULT.open,
      tab: isTab(tab) ? tab : DEFAULT.tab,
      poppedOut: typeof poppedOut === 'boolean' ? poppedOut : DEFAULT.poppedOut,
    };
  } catch {
    return DEFAULT;
  }
}

export interface DockOptions {
  /** Full-chrome modes only: host surfaces have no dock. */
  enabled: boolean;
  /** In compare, palettes stay a floating overlay: the dock is a Write-mode panel. */
  compareView: boolean;
  /** The floating overlay's own open state and category, owned by the editor. */
  floatingOpen: boolean;
  setFloatingOpen: (open: boolean | ((open: boolean) => boolean)) => void;
  setCategory: (category: PaletteCategory | null) => void;
}

export interface WorkspaceDock {
  readonly open: boolean;
  readonly tab: DockTab;
  readonly poppedOut: boolean;
  /** Palettes are docked, not floating: the left panel carries them. */
  readonly palettesDocked: boolean;
  /** Whether the palettes are visible, in whichever form they currently take. */
  readonly palettesVisible: boolean;
  isShowing: (tab: DockTab) => boolean;
  show: (tab: DockTab) => void;
  toggle: (tab: DockTab) => void;
  close: () => void;
  setPoppedOut: (poppedOut: boolean) => void;
  togglePalettes: () => void;
  openPalette: (category: string) => void;
}

/**
 * The left dock (Palettes, Instruments, Properties) and where the palettes live
 * (SHELL_REDESIGN_DESIGN §8.3). Persisted per browser; also owns the pop-out / dock choice
 * and routes the palette commands to whichever form is current, so F9 toggles the palettes
 * wherever they are.
 */
export function useWorkspaceDock({
  enabled,
  compareView,
  floatingOpen,
  setFloatingOpen,
  setCategory,
}: DockOptions): WorkspaceDock {
  const [state, setState] = useState<DockState>(readDockState);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Remembering the layout is not worth failing a toggle.
    }
  }, [state]);

  const palettesDocked = enabled && !state.poppedOut && !compareView;
  const isShowing = useCallback(
    (tab: DockTab) => enabled && state.open && state.tab === tab,
    [enabled, state.open, state.tab],
  );
  const show = useCallback(
    (tab: DockTab) => setState((prev) => ({ ...prev, open: true, tab })),
    [],
  );
  const toggle = useCallback(
    (tab: DockTab) =>
      setState((prev) =>
        prev.open && prev.tab === tab ? { ...prev, open: false } : { ...prev, open: true, tab },
      ),
    [],
  );
  const close = useCallback(() => setState((prev) => ({ ...prev, open: false })), []);
  const setPoppedOut = useCallback(
    (poppedOut: boolean) => {
      // Popping out opens the overlay; docking closes it and shows the tab.
      setState((prev) =>
        poppedOut
          ? { ...prev, poppedOut, open: prev.tab === 'palettes' ? false : prev.open }
          : { open: true, tab: 'palettes', poppedOut },
      );
      setFloatingOpen(poppedOut);
    },
    [setFloatingOpen],
  );

  const togglePalettes = useCallback(() => {
    setCategory(null);
    if (palettesDocked) toggle('palettes');
    else setFloatingOpen((open) => !open);
  }, [palettesDocked, setCategory, setFloatingOpen, toggle]);

  const openPalette = useCallback(
    (category: string) => {
      setCategory(category as PaletteCategory);
      if (palettesDocked) show('palettes');
      else setFloatingOpen(true);
    },
    [palettesDocked, setCategory, setFloatingOpen, show],
  );

  return useMemo(
    () => ({
      open: state.open,
      tab: state.tab,
      poppedOut: state.poppedOut,
      palettesDocked,
      palettesVisible: palettesDocked ? isShowing('palettes') : floatingOpen,
      isShowing,
      show,
      toggle,
      close,
      setPoppedOut,
      togglePalettes,
      openPalette,
    }),
    [
      state,
      palettesDocked,
      floatingOpen,
      isShowing,
      show,
      toggle,
      close,
      setPoppedOut,
      togglePalettes,
      openPalette,
    ],
  );
}
