/**
 * System following inside one page: keep the active system in a safe region instead of scrolling for every segment.
 * Rectangles are in the scroll container's content coordinates (CSS px, after zoom).
 */
export type Rect = { top: number; bottom: number; left: number; right: number };
export type Viewport = { scrollTop: number; scrollLeft: number; height: number; width: number };

/** Top of the safe band and where a revealed system lands, as fractions of the viewport height. */
const SAFE_TOP = 0.1;
const SAFE_BOTTOM = 0.8;
const REVEAL_AT = 0.15;
const SAFE_SIDE = 0.1;

/**
 * Where to scroll so `target` (the active system, cursor x at `cursorX`) is readable, or null when it already is.
 * The system lands near the top so the next one stays in view; a system taller than the safe band aligns to the top.
 * Horizontally only the cursor matters (high zoom).
 */
export function revealScroll(
  target: Rect,
  cursorX: number,
  viewport: Viewport,
): { top: number; left: number } | null {
  const { scrollTop, scrollLeft, height, width } = viewport;
  let top = scrollTop;
  let left = scrollLeft;
  const outsideVertically =
    target.top < scrollTop + height * SAFE_TOP || target.bottom > scrollTop + height * SAFE_BOTTOM;
  if (outsideVertically) top = Math.max(0, target.top - height * REVEAL_AT);
  const outsideHorizontally =
    cursorX < scrollLeft + width * SAFE_SIDE || cursorX > scrollLeft + width * (1 - SAFE_SIDE);
  if (outsideHorizontally) left = Math.max(0, cursorX - width * 0.3);
  return top === scrollTop && left === scrollLeft ? null : { top, left };
}
