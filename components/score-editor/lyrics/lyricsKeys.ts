/**
 * Lyric entry's keys, as MuseScore's (roadmap E17): what each does to the syllable being typed. The numbers are the
 * engine's `lyricsEntryCommit` actions (engine/musescore/bridge/lyricsentry.h).
 */
export const LYRICS_ACTIONS = {
  /** Escape, or leaving the box: keep the syllable and stop. */
  end: 0,
  /** Space: the next note, as a new word. */
  next: 1,
  /** Shift+Space: the previous note. */
  previous: 2,
  /** "-": the next note, joined by a hyphen. */
  syllable: 3,
  /** "_": the next note, under an extender line. */
  melisma: 4,
  /** Up arrow: the verse above. */
  verseUp: 5,
  /** Down arrow: the verse below, if this note has one. */
  verseDown: 6,
  /** Enter: a new verse on this note. */
  newVerse: 7,
} as const;

export type LyricsAction = (typeof LYRICS_ACTIONS)[keyof typeof LYRICS_ACTIONS];

interface KeyLike {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/** The action a key takes in lyric entry, or null for a key that types (or edits) the syllable. */
export function lyricsKeyAction(event: KeyLike): LyricsAction | null {
  const modified = event.ctrlKey || event.metaKey || event.altKey;
  if (event.key === 'Escape') return LYRICS_ACTIONS.end;
  if (modified) return null;
  switch (event.key) {
    case ' ':
      return event.shiftKey ? LYRICS_ACTIONS.previous : LYRICS_ACTIONS.next;
    case '-':
      return LYRICS_ACTIONS.syllable;
    case '_':
      return LYRICS_ACTIONS.melisma;
    case 'Enter':
      return LYRICS_ACTIONS.newVerse;
    case 'ArrowUp':
      return LYRICS_ACTIONS.verseUp;
    case 'ArrowDown':
      return LYRICS_ACTIONS.verseDown;
    default:
      return null;
  }
}

/**
 * The characters MuseScore types in a syllable with a modifier, since the plain keys move on: Ctrl+Space (Option+Space on
 * a Mac) an elision space, Ctrl+"-" a hyphen in the syllable.
 */
export function lyricsLiteral(event: KeyLike): string | null {
  if (!(event.ctrlKey || event.metaKey || event.altKey)) return null;
  if (event.key === ' ') return ' ';
  if (event.key === '-') return '-';
  return null;
}
