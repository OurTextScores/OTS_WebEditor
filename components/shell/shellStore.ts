/**
 * UI state the shell owns that commands need to reach: whether the palette, the shortcuts
 * list or an argument form is open, and the recent-scores list the File menu shows.
 *
 * A module-level store like the notice service, so a command's `run` can open the palette
 * without importing a component, and so `ScoreEditor` can publish the recent scores
 * without the shell reaching into its state.
 */
import type { CommandId } from '../../lib/commands/types';

export type PaletteMode = 'commands' | 'goto';

export interface RecentScore {
  readonly scoreId: string;
  readonly title: string;
  readonly lastUpdated: number;
}

/**
 * What the status bar and header transport show: view state that lives in `ScoreEditor` and
 * is published here by `useShellCommands`, so the shell components need no editor props.
 */
export interface ShellView {
  readonly zoom: number;
  readonly currentPage: number;
  readonly pageCount: number;
  /** More pages are still being laid out (progressive paging), so the count is a floor. */
  readonly pageCountIsFloor: boolean;
  readonly progressiveLoadEnabled: boolean;
  /** The interactive layout is still being finalised; editing unlocks when it finishes. */
  readonly preparing: boolean;
  readonly checkpointCount: number;
  readonly dirty: boolean;
  readonly isPlaying: boolean;
  readonly isPaused: boolean;
  /** A playback is starting (audio rendering or loading); it cannot be started again yet. */
  readonly audioBusy: boolean;
  readonly hasScore: boolean;
  /** The AI Tools and Score source panels beside the score are open (the activity bar shows them pressed). */
  readonly aiToolsOpen: boolean;
  readonly musicXmlOpen: boolean;
}

export const EMPTY_SHELL_VIEW: ShellView = {
  zoom: 1,
  currentPage: 0,
  pageCount: 1,
  pageCountIsFloor: false,
  progressiveLoadEnabled: true,
  preparing: false,
  checkpointCount: 0,
  dirty: false,
  isPlaying: false,
  isPaused: false,
  audioBusy: false,
  hasScore: false,
  aiToolsOpen: false,
  musicXmlOpen: false,
};

export interface ShellUiState {
  readonly palette: { readonly open: boolean; readonly mode: PaletteMode };
  readonly shortcutsOpen: boolean;
  /** The command whose argument form is showing, if any. */
  readonly form: CommandId | null;
  readonly recentScores: readonly RecentScore[];
  readonly view: ShellView;
  /** Whether the status bar is pinned; when not, it peeks while the pointer is at the edge. */
  readonly statusBarPinned: boolean;
}

const STATUS_BAR_KEY = 'ots.shell.statusBar';

/** localStorage can be absent or blocked; the status bar is pinned unless told otherwise. */
function readStatusBarPinned(): boolean {
  try {
    return window.localStorage.getItem(STATUS_BAR_KEY) !== 'hidden';
  } catch {
    return true;
  }
}

const initial: ShellUiState = {
  palette: { open: false, mode: 'commands' },
  shortcutsOpen: false,
  form: null,
  recentScores: [],
  view: EMPTY_SHELL_VIEW,
  statusBarPinned: readStatusBarPinned(),
};

let state: ShellUiState = initial;
const listeners = new Set<() => void>();

function update(patch: Partial<ShellUiState>): void {
  state = { ...state, ...patch };
  for (const listener of [...listeners]) listener();
}

export const getShellUiState = (): ShellUiState => state;

export const subscribeToShellUi = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const openPalette = (mode: PaletteMode = 'commands'): void =>
  update({ palette: { open: true, mode } });

export const closePalette = (): void => {
  if (state.palette.open) update({ palette: { ...state.palette, open: false } });
};

export const setShortcutsOpen = (open: boolean): void => {
  if (state.shortcutsOpen !== open) update({ shortcutsOpen: open });
};

export const openCommandForm = (commandId: CommandId): void => update({ form: commandId });
export const closeCommandForm = (): void => {
  if (state.form !== null) update({ form: null });
};

/** Replaces the list only when it actually changed, so a re-render does not notify. */
export function setRecentScores(scores: readonly RecentScore[]): void {
  const previous = state.recentScores;
  const same =
    previous.length === scores.length &&
    previous.every(
      (entry, index) =>
        entry.scoreId === scores[index].scoreId &&
        entry.title === scores[index].title &&
        entry.lastUpdated === scores[index].lastUpdated,
    );
  if (!same) update({ recentScores: scores });
}

/** Replaces the view only when a field changed, so a re-render of the editor does not notify. */
export function setShellView(view: ShellView): void {
  const previous = state.view;
  if ((Object.keys(view) as (keyof ShellView)[]).every((key) => previous[key] === view[key]))
    return;
  update({ view });
}

export function setStatusBarPinned(pinned: boolean): void {
  if (state.statusBarPinned === pinned) return;
  try {
    window.localStorage.setItem(STATUS_BAR_KEY, pinned ? 'shown' : 'hidden');
  } catch {
    // Remembering the choice is not worth failing the toggle.
  }
  update({ statusBarPinned: pinned });
}

export function resetShellUiForTests(): void {
  state = initial;
  for (const listener of [...listeners]) listener();
}
