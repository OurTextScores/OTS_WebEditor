// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { sanitizeEngineSvg } from '../lib/sanitize-svg';

const wrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${inner}</svg>`;

describe('sanitizeEngineSvg (M3)', () => {
  it('returns benign SVG unchanged (fast path)', () => {
    const svg = wrap('<rect x="0" y="0" width="10" height="10"/><text>Allegro</text>');
    expect(sanitizeEngineSvg(svg)).toBe(svg);
  });

  it('removes <script> elements', () => {
    const out = sanitizeEngineSvg(wrap('<script>alert(1)</script><rect/>'));
    expect(out).not.toMatch(/<script/i);
    expect(out).toContain('<rect');
  });

  it('removes <foreignObject> subtrees', () => {
    const out = sanitizeEngineSvg(
      wrap(
        '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject><rect/>',
      ),
    );
    expect(out.toLowerCase()).not.toContain('foreignobject');
    expect(out).toContain('<rect');
  });

  it('strips inline event handlers (the real innerHTML vector)', () => {
    const out = sanitizeEngineSvg(wrap('<image href="x" onerror="alert(1)"/>'));
    expect(out).not.toMatch(/onerror/i);
    expect(out.toLowerCase()).toContain('image');
  });

  it('strips event handlers on the root <svg> element', () => {
    const out = sanitizeEngineSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect/></svg>',
    );
    expect(out).not.toMatch(/onload/i);
  });

  it('removes javascript: hrefs (href and xlink:href) but keeps the element', () => {
    const out = sanitizeEngineSvg(
      wrap(
        '<a href="javascript:alert(1)"><text>x</text></a><a xlink:href="javascript:evil()"><text>y</text></a>',
      ),
    );
    expect(out.toLowerCase()).not.toContain('javascript:');
    expect(out).toContain('<text');
  });

  it('preserves legitimate xlink:href references', () => {
    const svg = wrap('<use xlink:href="#glyph-42"/>');
    const out = sanitizeEngineSvg(svg);
    expect(out).toContain('#glyph-42');
  });

  it('falls back to regex scrubbing when the SVG does not parse', () => {
    // Malformed (unclosed tag) → parsererror → regex path still removes the handler.
    const out = sanitizeEngineSvg('<svg><rect onclick="steal()" <broken>');
    expect(out).not.toMatch(/onclick/i);
  });

  it('handles empty/undefined input', () => {
    expect(sanitizeEngineSvg('')).toBe('');
    expect(sanitizeEngineSvg(undefined as unknown as string)).toBe(undefined);
  });
});
