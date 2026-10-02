import { describe, expect, it } from 'vitest';
import { compareSvg } from '../lib/layout-oracle';

describe('compareSvg', () => {
  it('reports nothing for identical output', () => {
    expect(compareSvg('x', 0, '<svg>a</svg>', '<svg>a</svg>')).toBeNull();
  });

  it('finds where the layouts first differ, and says which edit it was', () => {
    const diff = compareSvg('raise pitch', 2, '<svg><g x="1"/></svg>', '<svg><g x="2"/></svg>');
    expect(diff).toMatchObject({ label: 'raise pitch', page: 2, firstDiffAt: 11 });
    expect(diff?.incrementalExcerpt).toContain('x="1"');
    expect(diff?.fullExcerpt).toContain('x="2"');
  });

  it('treats a different length with the same prefix as a difference', () => {
    expect(compareSvg('x', 0, '<svg>a</svg>', '<svg>a</svg><g/>')?.firstDiffAt).toBe(12);
  });

  it('counts a changed page count even when the page is identical', () => {
    expect(compareSvg('x', 0, 'same', 'same', true)?.pageCountChanged).toBe(true);
  });
});
