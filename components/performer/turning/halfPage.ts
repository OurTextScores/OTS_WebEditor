/*
 * Half-page turns split between systems (performer mode, Phase 2): forScore's "farmhouse door", where one press shows
 * the top of the next page above the bottom of the current one, and the next completes the turn. Here the split never
 * cuts a system: it falls in the gap between the current page's systems nearest the middle, and the next page shows
 * only the systems that fit above it. Geometry from the engine's staff bands (page coordinates, as the page's SVG).
 */

export interface Band {
  readonly page: number;
  readonly system: number;
  readonly y: number;
  readonly height: number;
}

/** A system's vertical extent on its page. */
export interface SystemSpan {
  readonly top: number;
  readonly bottom: number;
}

/** The systems of `page`, top to bottom, from the staff bands of all its parts. */
export function systemsOf(bands: readonly Band[], page: number): SystemSpan[] {
  const spans = new Map<number, { top: number; bottom: number }>();
  for (const band of bands) {
    if (band.page !== page) continue;
    const span = spans.get(band.system);
    const top = band.y;
    const bottom = band.y + band.height;
    if (!span) spans.set(band.system, { top, bottom });
    else {
      span.top = Math.min(span.top, top);
      span.bottom = Math.max(span.bottom, bottom);
    }
  }
  return [...spans.values()].sort((a, b) => a.top - b.top);
}

/**
 * Where to split `page` for a half turn: the middle of the gap between two systems, the gap nearest the page's middle.
 * Null with fewer than two systems (nothing to split).
 */
export function splitPoint(systems: readonly SystemSpan[], pageHeight: number): number | null {
  if (systems.length < 2) return null;
  let best: number | null = null;
  for (let i = 0; i < systems.length - 1; i += 1) {
    const gap = (systems[i].bottom + systems[i + 1].top) / 2;
    if (best === null || Math.abs(gap - pageHeight / 2) < Math.abs(best - pageHeight / 2))
      best = gap;
  }
  return best;
}

/**
 * How much of the next page to show above the split: down to the end of the last whole system that ends above
 * `limit` (plus half the following gap), or null when not even its first system fits.
 */
export function topThatFits(systems: readonly SystemSpan[], limit: number): number | null {
  let end: number | null = null;
  for (let i = 0; i < systems.length; i += 1) {
    if (systems[i].bottom > limit) break;
    const next = systems[i + 1];
    end = next
      ? Math.min(limit, (systems[i].bottom + next.top) / 2)
      : Math.min(limit, systems[i].bottom);
  }
  return end;
}

/** The half view of `page`: the split on it, and how much of the next page fits above; null when it has none. */
export interface HalfView {
  readonly split: number;
  readonly nextTop: number;
}

export function halfViewOf(
  bands: readonly Band[],
  page: number,
  pageHeight: number,
): HalfView | null {
  const split = splitPoint(systemsOf(bands, page), pageHeight);
  if (split === null) return null;
  const nextTop = topThatFits(systemsOf(bands, page + 1), split);
  return nextTop === null ? null : { split, nextTop };
}
