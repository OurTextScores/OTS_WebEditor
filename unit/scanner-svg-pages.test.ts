import { describe, expect, it, vi } from 'vitest';
import { renderScannerPageSvgs } from '../components/score-editor/compare/scanner-svg-pages';
import type { Positions, Score } from '../lib/webmscore-loader';

const page = (id: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700" viewBox="0 0 500 700"><path id="${id}" d="M 10 10 L 20 20"/></svg>`;
const positions = { pageSize: { width: 500, height: 700 }, elements: [{ page: 0 }, { page: 1 }] } as Positions;

describe('scanner SVG pages', () => {
  it('draws later pages at the offsets used by measure positions, including selected notes', async () => {
    const saveSvg = vi.fn(async () => page('later-page-note'));
    const score = { saveSvg, npages: async () => 2 } as unknown as Score;
    const svg = await renderScannerPageSvgs(score, '<?xml version="1.0"?>' + page('first-page-note'), positions, true);
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const pages = doc.documentElement.querySelectorAll(':scope > svg');
    expect(pages).toHaveLength(2);
    expect(pages[0].getAttribute('y')).toBe('0');
    expect(pages[1].getAttribute('y')).toBe('1960');
    expect(pages[1].getAttribute('height')).toBe('1960');
    expect(pages[1].querySelector('#later-page-note')).not.toBeNull();
    expect(doc.documentElement.getAttribute('height')).toBe('3920');
    expect(saveSvg).toHaveBeenCalledExactlyOnceWith(1, true, true);
  });

  it('uses later-page measure positions when the optional page-count method is absent', async () => {
    const saveSvg = vi.fn(async () => page('later-page-note'));
    const svg = await renderScannerPageSvgs({ saveSvg } as unknown as Score, page('first-page-note'), positions, false);
    expect(svg).toContain('later-page-note');
    expect(saveSvg).toHaveBeenCalledExactlyOnceWith(1, true, false);
  });

  it('keeps a single page at the established render width without drawing it twice', async () => {
    const saveSvg = vi.fn();
    const svg = await renderScannerPageSvgs({ saveSvg } as unknown as Score, page('first-page-note'), { ...positions, elements: [] }, false);
    expect(svg).toContain('width="1400"');
    expect(svg).not.toContain('height="700"');
    expect(saveSvg).not.toHaveBeenCalled();
  });
});
