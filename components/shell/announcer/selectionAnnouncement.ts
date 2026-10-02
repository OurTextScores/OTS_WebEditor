/**
 * The words for a selection or an edit. Pure, so they are unit-tested without a score. The
 * concise form follows Viritura's `selectionAnnouncement`: say what is selected, not where.
 */

export interface SelectionSummary {
  /** The engine's element name for the selection (`Note`, `Hairpin`, `LayoutBreak`, …). */
  readonly elementType: string;
  readonly selectionCount: number;
}

/** `LayoutBreak` and `LAYOUT_BREAK` both become `layout break`. */
export function humanizeElementType(elementType: string): string {
  return elementType
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
}

const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function describeSelection(summary: SelectionSummary | null): string | null {
  if (!summary || summary.selectionCount <= 0) return null;
  const type = humanizeElementType(summary.elementType);
  if (summary.selectionCount === 1) return type ? `${sentenceCase(type)} selected.` : 'Selected.';
  return `${summary.selectionCount} elements selected.`;
}

export const SELECTION_CLEARED = 'Selection cleared.';

/** `raise pitch` → `Raise pitch.` */
export function describeEdit(label: string): string {
  return `${sentenceCase(label.trim())}.`;
}

export function describeMode(modeLabel: string): string {
  return `${modeLabel} mode.`;
}
