/**
 * Engraving (SVG user space) ↔ client coordinates for the score's root `<svg>`.
 *
 * The editor zooms with a CSS `transform: scale()` on an HTML ancestor. WebKit (Safari) leaves that transform out of
 * the root SVG's `getScreenCTM()`, so a click mapped through it lands at the wrong score position and selects
 * nothing. The SVG's client rect does include it in every browser, so the mapping is built from the rect and the
 * `viewBox`, honouring `preserveAspectRatio`. Without a usable viewBox it falls back to `getScreenCTM()`.
 */
export type SvgScreenMapping = {
  toClient: (x: number, y: number) => { x: number; y: number };
  toEngraving: (x: number, y: number) => { x: number; y: number };
};

export function svgScreenMapping(svg: SVGSVGElement): SvgScreenMapping | null {
  const view = svg.viewBox?.baseVal;
  const rect = svg.getBoundingClientRect();
  if (view && view.width > 0 && view.height > 0 && rect.width > 0 && rect.height > 0) {
    // SVGPreserveAspectRatio constants (absent outside browsers): align NONE = 1, meetOrSlice SLICE = 2.
    const aspect = svg.preserveAspectRatio?.baseVal;
    const none = aspect?.align === 1;
    const fit = aspect?.meetOrSlice === 2 ? Math.max : Math.min;
    const sx = none
      ? rect.width / view.width
      : fit(rect.width / view.width, rect.height / view.height);
    const sy = none ? rect.height / view.height : sx;
    // Default alignment (xMidYMid) centres the content; the score's width/height match its viewBox, so this is 0.
    const ox = rect.left + (rect.width - view.width * sx) / 2 - view.x * sx;
    const oy = rect.top + (rect.height - view.height * sy) / 2 - view.y * sy;
    return {
      toClient: (x, y) => ({ x: ox + x * sx, y: oy + y * sy }),
      toEngraving: (x, y) => ({ x: (x - ox) / sx, y: (y - oy) / sy }),
    };
  }
  const matrix = typeof svg.getScreenCTM === 'function' ? svg.getScreenCTM() : null;
  if (!matrix) return null;
  const inverse = matrix.inverse();
  return {
    toClient: (x, y) => new DOMPoint(x, y).matrixTransform(matrix),
    toEngraving: (x, y) => new DOMPoint(x, y).matrixTransform(inverse),
  };
}
