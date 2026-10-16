import type { Positions, Score } from '@/lib/webmscore-loader';

const RENDER_WIDTH = 1400;

function sizedSvg(svg: string, height?: number, top = 0): string {
  return svg.replace(/^[\s\S]*?(?=<svg\b)/, '').replace(/<svg\b[^>]*>/, (tag) => {
    const withoutSize = tag
      .replace(/\s(?:width|height|x|y|preserveAspectRatio)="[^"]*"/gi, '');
    return withoutSize.replace(
      /^<svg/,
      `<svg width="${RENDER_WIDTH}" preserveAspectRatio="xMinYMin meet"${height === undefined ? '' : ` height="${height}" x="0" y="${top}"`}`,
    );
  });
}

/** Stack engraved pages in the same coordinates used by scanner measure bounds. */
export async function renderScannerPageSvgs(
  score: Score,
  firstSvg: string,
  positions: Positions | null,
  highlightSelection: boolean,
): Promise<string> {
  const width = positions?.pageSize?.width || 0;
  const height = positions?.pageSize?.height || 0;
  if (width <= 0 || height <= 0) return sizedSvg(firstSvg);
  const positionedPages = Math.max(1, ...(positions?.elements || []).map(element => element.page + 1));
  const pageCount = Math.max(positionedPages, (await score.npages?.()) || 1);
  if (pageCount === 1) return sizedSvg(firstSvg);
  const pageHeight = height * RENDER_WIDTH / width;
  const pages = [sizedSvg(firstSvg, pageHeight)];
  for (let page = 1; page < pageCount; page += 1) {
    pages.push(sizedSvg(await score.saveSvg(page, true, highlightSelection), pageHeight, page * pageHeight));
  }
  const totalHeight = pageHeight * pageCount;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${RENDER_WIDTH}" height="${totalHeight}" viewBox="0 0 ${RENDER_WIDTH} ${totalHeight}">${pages.join('')}</svg>`;
}
