/*
 * Layout for the device (performer mode, Phase 1): the score is laid out with a page the shape of the screen, so a
 * page fills it with no letterboxing, and with the staff size the performer chose. One CSS pixel is taken as 1/96
 * inch (the CSS reference), so the page renders 1:1 on screen: the staff size is in screen pixels on any iPad.
 * The engine stores page lengths in inches and the staff space (spatium) in 1/1200 inch (MScore::DPI).
 */

const CSS_PX_PER_INCH = 96;
const SPATIUM_UNITS_PER_INCH = 1200;

/** The staff space a printed part uses (about 1.75 mm): the default size, on screen as on paper. */
export const DEFAULT_STAFF_SPACE_PX = 6.6;
/** The sizes the performer can choose, as a factor of the default. */
export const STAFF_SCALES = [0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8, 2] as const;

/** Margins around the music on the screen, in CSS pixels (the safe areas are padded separately). */
const MARGIN_PX = { side: 24, top: 20, bottom: 20 };
/** Too small a viewport to lay out for (a collapsed window, a test): keep the score's own layout. */
const MIN_PAGE_PX = 200;

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** Engine style values for a page the shape of `viewport` at `staffScale`, or null when the viewport is too small. */
export function devicePageStyle(
  viewport: Viewport,
  staffScale: number,
): Record<string, number | boolean> | null {
  if (!(viewport.width >= MIN_PAGE_PX && viewport.height >= MIN_PAGE_PX)) return null;
  const inches = (px: number) => px / CSS_PX_PER_INCH;
  const scale = Number.isFinite(staffScale) && staffScale > 0 ? staffScale : 1;
  return {
    pageWidth: inches(viewport.width),
    pageHeight: inches(viewport.height),
    pagePrintableWidth: inches(viewport.width - 2 * MARGIN_PX.side),
    pageEvenLeftMargin: inches(MARGIN_PX.side),
    pageOddLeftMargin: inches(MARGIN_PX.side),
    pageEvenTopMargin: inches(MARGIN_PX.top),
    pageOddTopMargin: inches(MARGIN_PX.top),
    pageEvenBottomMargin: inches(MARGIN_PX.bottom),
    pageOddBottomMargin: inches(MARGIN_PX.bottom),
    pageTwosided: false,
    spatium: (DEFAULT_STAFF_SPACE_PX * scale * SPATIUM_UNITS_PER_INCH) / CSS_PX_PER_INCH,
  };
}

/** The next larger or smaller staff scale from `current`, staying at either end. */
export function stepStaffScale(current: number, direction: 1 | -1): number {
  const index = STAFF_SCALES.findIndex((scale) => scale >= current - 1e-9);
  const at = index < 0 ? STAFF_SCALES.length - 1 : index;
  return STAFF_SCALES[Math.min(STAFF_SCALES.length - 1, Math.max(0, at + direction))];
}

/** "landscape" or "portrait", for remembering a layout per orientation. */
export const orientationOf = (viewport: Viewport) =>
  viewport.width >= viewport.height ? 'landscape' : 'portrait';
