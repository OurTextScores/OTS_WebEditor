/** The annotation tools (performer mode, Phase 4). */
export type AnnotationTool = 'pen' | 'highlighter' | 'eraser' | 'text' | 'stamp';

/** The stamps are in stampGlyphs.ts (engraved glyphs in the music font). */
export { STAMPS } from './stampGlyphs';

/** Ink colours, as CSS colour names (blue, red, green, black). */
export const COLORS = ['royalblue', 'crimson', 'forestgreen', 'black'] as const;

/** Ink style per tool, widths in staff spaces. */
export const INK = {
  pen: { width: 0.18, opacity: 1 },
  highlighter: { width: 1.6, opacity: 0.3 },
} as const;
