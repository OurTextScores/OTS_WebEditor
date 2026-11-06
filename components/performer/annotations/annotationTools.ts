/** The annotation tools (performer mode, Phase 4). */
export type AnnotationTool = 'pen' | 'highlighter' | 'eraser' | 'text' | 'stamp';

/** Musicians' stamps, as plain characters (no music font needed): fingerings, bowings, breath, "watch!", accidentals. */
export const STAMPS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  'V',
  '⊓',
  '’',
  '👓',
  '♯',
  '♭',
  '♮',
  'p',
  'f',
  '→',
] as const;

/** Ink colours, as CSS colour names (blue, red, green, black). */
export const COLORS = ['royalblue', 'crimson', 'forestgreen', 'black'] as const;

/** Ink style per tool, widths in staff spaces. */
export const INK = {
  pen: { width: 0.18, opacity: 1 },
  highlighter: { width: 1.6, opacity: 0.3 },
} as const;
