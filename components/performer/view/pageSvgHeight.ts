/** A page's height in its own coordinates (its SVG's viewBox), for the half-page split; null without one. */
export function viewBoxHeight(svg: string | null): number | null {
  const match = svg?.match(/viewBox="[\d.\-]+\s+[\d.\-]+\s+[\d.\-]+\s+([\d.]+)"/);
  return match ? Number(match[1]) : null;
}

/**
 * The engine's page SVG made to fill its box: its root's fixed pixel width and height become 100%, fitted by its
 * viewBox (xMidYMid meet). Every browser then draws the page exactly where the annotation overlay, the half-page
 * clip and taps expect it (WebKit otherwise keeps the fixed size the CSS asks to override).
 */
export function fillingSvg(svg: string): string {
  return svg.replace(/<svg\b([^>]*)>/, (_root, attributes: string) => {
    const kept = attributes.replace(/\s(width|height|preserveAspectRatio)="[^"]*"/g, '');
    return `<svg${kept} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`;
  });
}
