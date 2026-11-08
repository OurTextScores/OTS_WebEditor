import type { BarSignature } from './barSignatures';
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

/** A position in the music: a written bar and a beat (ticks from its start). */
export interface MusicPosition {
  readonly bar: number;
  readonly tick: number;
}

export interface Anchor {
  /** The written bar (measure index). */
  readonly bar: number;
  /** The part (index of its staff band in the system). */
  readonly part: number;
  /**
   * For stamps and text: the beat it sits at, in ticks from the bar's start (the same in every view and after the bar
   * moves); absent for ink (the bar's left edge).
   */
  readonly tick?: number;
  /** What the bar looked like when the mark was made, to find it again if bars are inserted or removed. */
  readonly signature?: BarSignature;
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
  /**
   * Engraved into the score (Phase 7): when, and the version it went into. Its written form is then hidden: the
   * performer sees only the engraved notation.
   */
  readonly engravedIn?: string;
  /**
   * Ink only: where the stroke starts and ends in the music (its leftmost and rightmost points: bar, and beat in ticks
   * from the bar's start), taken from the layout it was drawn on, so a hairpin or slur can be engraved between those
   * notes in any other layout (Phase 7c). Absent for ink drawn before this, or off the music.
   */
  readonly extent?: { readonly start: MusicPosition; readonly end: MusicPosition };
  /** Reviewed and kept as a mark (Phase 7b): not offered for review again. */
  readonly reviewedAt?: string;
  readonly createdAt: number;
}

/** A new annotation id (random, collision-safe enough for one device's marks). */
export function newAnnotationId(): string {
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Whether `annotation` shows at Play-through occurrence `occurrence` (always, in the written view: null). */
export function showsAt(annotation: Annotation, occurrence: number | null): boolean {
  if (annotation.engravedIn) return false; // engraved: the notation shows instead
  if (occurrence === null) return annotation.onlyAt === undefined;
  if (annotation.onlyAt !== undefined) return annotation.onlyAt === occurrence;
  return !(annotation.hiddenAt ?? []).includes(occurrence);
}
