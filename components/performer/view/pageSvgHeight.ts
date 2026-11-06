/** A page's height in its own coordinates (its SVG's viewBox), for the half-page split; null without one. */
export function viewBoxHeight(svg: string | null): number | null {
  const match = svg?.match(/viewBox="[\d.\-]+\s+[\d.\-]+\s+[\d.\-]+\s+([\d.]+)"/);
  return match ? Number(match[1]) : null;
}
