/*
 * Recognising the two ink shapes performers draw most, without a model (Phase 7c): a hairpin (one V-shaped stroke,
 * "<" for crescendo, ">" for diminuendo) and a slur (one arc). Points are in staff spaces, y down, as the annotation
 * keeps them. Anything else is left for the model; a shape that is only nearly right is left too (false positives
 * would be engraved as wrong notation).
 */

type Point = readonly [number, number, ...number[]];

export type InkShape =
  | { readonly kind: 'hairpin'; readonly subtype: 'cresc' | 'dim' }
  | { readonly kind: 'slur'; readonly above: boolean }
  | null;

/** Greatest distance of the points from the line through `a` and `b`, signed (positive below the line, y down). */
function deviations(points: readonly Point[], a: Point, b: Point): number[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  return points.map((p) => ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / -length);
}

/** How many peaks a sequence has, ignoring wobbles smaller than `tolerance`. */
function peaks(values: readonly number[], tolerance: number): number {
  let count = 0;
  let rising = true;
  let extreme = values[0] ?? 0;
  for (const value of values) {
    if (rising) {
      if (value > extreme) extreme = value;
      else if (extreme - value > tolerance) {
        count += 1;
        rising = false;
        extreme = value;
      }
    } else if (value < extreme) extreme = value;
    else if (value - extreme > tolerance) {
      rising = true;
      extreme = value;
    }
  }
  return count;
}

const maxAbs = (values: readonly number[]) =>
  values.reduce((most, value) => Math.max(most, Math.abs(value)), 0);

/** A near-straight run of points (an arm of a hairpin): no point strays far from the line through its ends. */
function straight(points: readonly Point[]): boolean {
  if (points.length < 2) return false;
  const a = points[0];
  const b = points[points.length - 1];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return length > 0.8 && maxAbs(deviations(points, a, b)) <= Math.max(0.3, length * 0.15);
}

function hairpin(points: readonly Point[]): InkShape {
  const xs = points.map((p) => p[0]);
  const width = Math.max(...xs) - Math.min(...xs);
  if (width < 1.5) return null;
  for (const [subtype, pick] of [
    ['cresc', (a: number, b: number) => a < b],
    ['dim', (a: number, b: number) => a > b],
  ] as const) {
    // The apex: the leftmost point for "<", the rightmost for ">", in the middle of the stroke
    const apex = points.reduce((best, p, index) => (pick(p[0], points[best][0]) ? index : best), 0);
    if (apex < points.length * 0.2 || apex > points.length * 0.8) continue;
    const first = points.slice(0, apex + 1);
    const second = points.slice(apex);
    if (!straight(first) || !straight(second)) continue;
    const start = points[0];
    const end = points[points.length - 1];
    const tip = points[apex];
    // Both arms reach away from the apex the same way, roughly level, and open apart
    const reach = Math.min(Math.abs(start[0] - tip[0]), Math.abs(end[0] - tip[0]));
    const opening = Math.abs(start[1] - end[1]);
    const between = (tip[1] - start[1]) * (tip[1] - end[1]) <= 0;
    if (reach >= width * 0.6 && opening >= 0.4 && opening <= reach * 1.2 && between) {
      return { kind: 'hairpin', subtype };
    }
  }
  return null;
}

function slur(points: readonly Point[]): InkShape {
  const start = points[0];
  const end = points[points.length - 1];
  const width = Math.abs(end[0] - start[0]);
  if (width < 1.5 || Math.abs(end[1] - start[1]) > width * 0.5) return null;
  // Moving steadily one way across
  const direction = Math.sign(end[0] - start[0]);
  let backwards = 0;
  for (let index = 1; index < points.length; index += 1) {
    if ((points[index][0] - points[index - 1][0]) * direction < -0.15) backwards += 1;
  }
  if (backwards > points.length * 0.1) return null;
  // Bowed to one side by a believable amount
  const offsets = deviations(points, start, end);
  const bow = maxAbs(offsets);
  if (bow < width * 0.08 || bow > width * 0.6) return null;
  const sign = Math.sign(offsets.reduce((sum, value) => sum + value, 0));
  const sameSide = offsets.filter(
    (value) => Math.abs(value) < 0.1 || Math.sign(value) === sign,
  ).length;
  if (sameSide < offsets.length * 0.85) return null;
  // One smooth bow: the bulge rises to a single peak and falls back (a zigzag peaks again and again)
  if (
    peaks(
      offsets.map((value) => value * sign),
      bow * 0.2,
    ) > 1
  )
    return null;
  // Offsets are positive below the line through the ends (y down): a slur bowing upward is drawn above the notes
  return { kind: 'slur', above: sign < 0 };
}

/** The shape one ink stroke is, or null when it is not clearly a hairpin or a slur. */
export function recogniseInk(points: readonly Point[]): InkShape {
  if (points.length < 5) return null;
  return hairpin(points) ?? slur(points);
}
