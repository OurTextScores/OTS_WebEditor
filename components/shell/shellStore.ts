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

export interface ShellUiState {
  readonly palette: { readonly open: boolean; readonly mode: PaletteMode };
  readonly shortcutsOpen: boolean;
  /** The command whose argument form is showing, if any. */
  readonly form: CommandId | null;
  readonly recentScores: readonly RecentScore[];
}

const initial: ShellUiState = {
  palette: { open: false, mode: 'commands' },
  shortcutsOpen: false,
  form: null,
  recentScores: [],
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

export function resetShellUiForTests(): void {
  state = initial;
  for (const listener of [...listeners]) listener();
}
