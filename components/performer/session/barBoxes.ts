import type { Positions } from '../../../lib/webmscore-loader';

/** A bar's box on its page, as fractions of the page (positions use the page size as their coordinate space). */
export interface BarBox {
  readonly index: number;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The laid-out bars of `positions` (the engine's measure positions), as page fractions. */
export function barBoxesOf(positions: Positions | null): BarBox[] {
  const size = positions?.pageSize;
  if (!positions || !size?.width || !size.height) return [];
  return positions.elements
    .filter((element) => element.page >= 0)
    .map((element) => ({
      index: element.id,
      page: element.page,
      x: element.x / size.width,
      y: element.y / size.height,
      width: element.sx / size.width,
      height: element.sy / size.height,
    }));
}

/** The bar under a point given as fractions of `page`, or null. */
export function barAt(
  bars: readonly BarBox[],
  page: number,
  fx: number,
  fy: number,
): BarBox | null {
  return (
    bars.find(
      (bar) =>
        bar.page === page &&
        fx >= bar.x &&
        fx <= bar.x + bar.width &&
        fy >= bar.y &&
        fy <= bar.y + bar.height,
    ) ?? null
  );
}
