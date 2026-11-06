import type { Annotation } from './annotationModel';
import { stampOf } from './stampGlyphs';

/** One annotation changed: added (before null), removed (after null) or replaced. */
export type Change = { readonly before: Annotation | null; readonly after: Annotation | null };

/** One step of the marks' history, as the editor's Edits panel shows it: a description and its changes. */
export interface HistoryStep {
  readonly id: number;
  readonly description: string;
  readonly changes: readonly Change[];
}

/** The history: steps oldest first, `index` of them applied (0: the marks as opened). */
export interface MarksHistory {
  readonly steps: readonly HistoryStep[];
  readonly index: number;
}

export const EMPTY_HISTORY: MarksHistory = { steps: [], index: 0 };

/** A new step after the applied ones (a new change after an undo drops the steps that Redo would bring back). */
export function recorded(history: MarksHistory, step: HistoryStep): MarksHistory {
  return { steps: [...history.steps.slice(0, history.index), step], index: history.index + 1 };
}

/** The changes that move the marks from `history.index` steps applied to `target`, in order. */
export function changesTo(history: MarksHistory, target: number): Change[] {
  const to = Math.max(0, Math.min(history.steps.length, target));
  const changes: Change[] = [];
  for (let at = history.index; at > to; at -= 1) {
    // Undo a step: its changes reversed, each inverted
    for (const change of [...history.steps[at - 1].changes].reverse()) {
      changes.push({ before: change.after, after: change.before });
    }
  }
  for (let at = history.index; at < to; at += 1) changes.push(...history.steps[at].changes);
  return changes;
}

/** A mark in a few words, for the history: "Stamp mf, bar 3", "Pen, bar 5", "Text “breathe”, bar 2". */
export function describeMark(annotation: Annotation): string {
  const bar = `bar ${annotation.anchor.bar + 1}`;
  if (annotation.kind === 'ink')
    return `${annotation.style.opacity < 1 ? 'Highlighter' : 'Pen'}, ${bar}`;
  if (annotation.kind === 'stamp')
    return `Stamp ${stampOf(annotation.content)?.label ?? annotation.content}, ${bar}`;
  return `Text “${annotation.content}”, ${bar}`;
}
