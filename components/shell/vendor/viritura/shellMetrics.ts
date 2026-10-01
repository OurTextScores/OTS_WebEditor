/**
 * Panel geometry shared by the layout math and the CSS. Mirrors `--shell-panel-inset` and
 * `--shell-panel-gap` in `app/globals.css`; the layout needs the numbers in JavaScript to
 * report insets to the canvas, so change them together.
 */
export const PANEL_INSET = 12;
export const PANEL_GAP = 10;
/** Width of the edge affordance that brings hidden panels back, plus a small content gap. */
export const PANEL_HANDLE_INSET = 28;
/** The least canvas the dock leaves before panels shrink, and then overlay it. */
export const MIN_CANVAS_WIDTH = 280;
/** The narrowest an overlaid panel is squeezed to when several have to share a small window. */
export const OVERLAY_MIN_WIDTH = 200;
