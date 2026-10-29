import type { DialogContext, ScoreDialogKind } from './dialogSpecs';

/** Which score dialog is open, and what it acts on. One at a time, as MuseScore's are modal. */
export interface OpenScoreDialog {
  readonly kind: ScoreDialogKind;
  readonly context: DialogContext;
}

let open: OpenScoreDialog | null = null;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of [...listeners]) listener();
};

export const getOpenScoreDialog = (): OpenScoreDialog | null => open;

export const subscribeToScoreDialog = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const openScoreDialog = (kind: ScoreDialogKind, context: DialogContext = {}): void => {
  open = { kind, context };
  notify();
};

export const closeScoreDialog = (): void => {
  if (open === null) return;
  open = null;
  notify();
};
