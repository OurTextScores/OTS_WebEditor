/*
 * Performer annotations (Phase 4): marks a performer adds over the score, kept apart from it (never score edits) and
 * stored on the device. Each is anchored to the music, not to the page, so it follows relayout, the staff size, the
 * device's orientation and the Play-through view:
 * - ink (pen, highlighter): to the bar it starts in, its points in staff spaces from the bar's left edge and the top
 *   line of the staff it was drawn at;
 * - stamps and text: to the nearest note or rest's beat (its written tick) in that bar and staff, offset in staff
 *   spaces.
 * Bars are written bars (measure indices of the written score): in the Play-through view an annotation appears at
 * every occurrence of its bar, unless hidden there (`hiddenAt`), or shown only at one (`onlyAt`).
 */

export type AnnotationKind = 'ink' | 'stamp' | 'text';

export interface Anchor {
  /** The written bar (measure index). */
  readonly bar: number;
  /** The part (index of its staff band in the system). */
  readonly part: number;
  /** For stamps and text: the beat (written tick) it sits at; absent for ink (the bar's left edge). */
  readonly tick?: number;
}

export interface AnnotationStyle {
  readonly color: string;
  /** Line width in staff spaces (ink). */
  readonly width: number;
  readonly opacity: number;
}

export interface Annotation {
  readonly id: string;
  /** The score it belongs to (its URL or identity) and the part it was made on (-1 the full score). */
  readonly scoreKey: string;
  readonly scorePart: number;
  readonly kind: AnnotationKind;
  readonly anchor: Anchor;
  /** Ink: points [x, y, pressure], in staff spaces from the anchor. Stamp and text: one point, the offset. */
  readonly points: readonly (readonly [number, number, number])[];
  readonly style: AnnotationStyle;
  /** Stamp: its glyph; text: its words. */
  readonly content?: string;
  /** Play-through occurrences (indices into the playing order) where it is hidden ("only this one" deleted). */
  readonly hiddenAt?: readonly number[];
  /** Shown at this occurrence only ("only this one" edited: a copy for one occurrence). */
  readonly onlyAt?: number;
  readonly createdAt: number;
}

/** A new annotation id (random, collision-safe enough for one device's marks). */
export function newAnnotationId(): string {
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Whether `annotation` shows at Play-through occurrence `occurrence` (always, in the written view: null). */
export function showsAt(annotation: Annotation, occurrence: number | null): boolean {
  if (occurrence === null) return annotation.onlyAt === undefined;
  if (annotation.onlyAt !== undefined) return annotation.onlyAt === occurrence;
  return !(annotation.hiddenAt ?? []).includes(occurrence);
}
