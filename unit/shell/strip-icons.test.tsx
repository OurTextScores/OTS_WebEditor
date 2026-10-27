// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GlyphIcon,
  placeGlyph,
  placeRun,
  StripIcon,
} from '../../components/shell/toolbar/strip/icons/StripIcon';
import { GLYPH_PATHS } from '../../components/shell/toolbar/strip/icons/glyphPaths.generated';
import {
  ICON_VIEW_WIDTH,
  QUICK_ROW_ICON_SPECS,
  STRIP_ICON_SPECS,
} from '../../components/shell/toolbar/strip/icons/stripIconSpecs';
import {
  flattenControls,
  STRIP_GROUPS,
  type StripMenu,
} from '../../components/shell/toolbar/strip/toolbarLayout';

afterEach(cleanup);

const controls = flattenControls(STRIP_GROUPS);
const menus = controls.filter((control): control is StripMenu => control.kind === 'menu');

/** Controls that keep a Lucide icon: file, view and edit chrome with no notation in it. */
const CHROME = new Set([
  'btn-open-score',
  'btn-new-score',
  'btn-load-scores-to-compare',
  'btn-create-share-link',
  'btn-embed',
  'dropdown-export',
  'btn-select-all',
  'dropdown-selection-filter',
  'btn-delete',
  'btn-toggle-palettes',
  'btn-toggle-panels',
  'link-help',
  // The palette's own beamed-notes picture (BeamIcon), not a drawing of ours.
  'dropdown-beams',
]);

describe('strip icons', () => {
  it('give every control a designed icon, except the named chrome', () => {
    const missing = controls
      .filter((control) => !STRIP_ICON_SPECS[control.testId] && !CHROME.has(control.testId))
      .map((control) => control.testId);
    expect(missing).toEqual([]);
    const stale = [...CHROME, ...Object.keys(STRIP_ICON_SPECS)].filter(
      (id) => !controls.some((control) => control.testId === id),
    );
    expect(stale).toEqual([]);
  });

  it('only use glyphs that were extracted from the font (a missing one would draw nothing)', () => {
    const codes = new Set<string>();
    for (const spec of Object.values(STRIP_ICON_SPECS)) {
      for (const part of spec) if ('glyph' in part) codes.add(part.glyph);
    }
    for (const menu of menus) for (const item of menu.items) if (item.glyph) codes.add(item.glyph);
    for (const control of controls)
      if ('glyph' in control && typeof control.glyph === 'string') codes.add(control.glyph);
    for (const menu of menus)
      for (const item of menu.items)
        for (const part of item.icon ?? []) if ('glyph' in part) codes.add(part.glyph);
    // A dynamic is a run of glyphs, one per letter: every one of them must be there.
    const missing = [...codes]
      .flatMap((glyph) => Array.from(glyph))
      .filter((glyph) => (glyph.codePointAt(0) ?? 0) >= 0xe000)
      .filter((glyph) => !(glyph.codePointAt(0)!.toString(16).toUpperCase() in GLYPH_PATHS));
    expect(missing.map((glyph) => glyph.codePointAt(0)!.toString(16))).toEqual([]);
  });

  it('keep every glyph inside its grid, so none overflows its button (the clef used to)', () => {
    const outside: string[] = [];
    const isInside = (
      bounds: { left: number; top: number; right: number; bottom: number } | undefined,
      width: number,
    ) =>
      !bounds ||
      (bounds.left >= 0 && bounds.top >= 0 && bounds.right <= width && bounds.bottom <= 24);
    const inside = (part: Parameters<typeof placeGlyph>[0], width: number) =>
      isInside(placeGlyph(part)?.bounds, width);
    const specs = { ...STRIP_ICON_SPECS, ...QUICK_ROW_ICON_SPECS };
    for (const [id, spec] of Object.entries(specs)) {
      for (const part of spec) {
        if ('glyph' in part && !inside(part, ICON_VIEW_WIDTH[id] ?? 24)) outside.push(id);
      }
    }
    for (const menu of menus) {
      for (const item of menu.items) {
        if (item.glyph && (item.glyph.codePointAt(0) ?? 0) >= 0xe000) {
          const fits =
            Array.from(item.glyph).length > 1
              ? isInside(
                  placeRun(Array.from(item.glyph))?.bounds,
                  placeRun(Array.from(item.glyph))?.viewWidth ?? 24,
                )
              : inside({ glyph: item.glyph, em: 18, box: 19 }, 24);
          if (!fits) outside.push(item.testId);
        }
        for (const part of item.icon ?? []) {
          if ('glyph' in part && !inside(part, 24)) outside.push(item.testId);
        }
      }
    }
    expect(outside).toEqual([]);
  });

  it('draws a glyph as one filled path, scaled to fit', () => {
    const { container } = render(<GlyphIcon glyph={''} />);
    const paths = container.querySelectorAll('svg path');
    expect(paths).toHaveLength(1);
    expect(paths[0].getAttribute('transform')).toMatch(/^translate\(.+\) scale\(.+\)$/);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('sets a dynamic as its letters side by side, every one drawn (mp used to show only its m)', () => {
    const { container } = render(<GlyphIcon glyph={'\uE521\uE520'} />);
    expect(container.querySelector('svg')).toHaveAttribute('data-glyph', 'E521 E520');
    const paths = container.querySelectorAll('svg path');
    expect(paths).toHaveLength(2);
    // The p is set after the m, by the m's advance.
    expect(paths[0].getAttribute('transform')).toBeNull();
    expect(paths[1].getAttribute('transform')).toMatch(/^translate\([1-9]\d* 0\)$/);
  });

  it('draws a staccato on a notehead, as the palettes show it, and a key name as text', () => {
    const { container, rerender } = render(<GlyphIcon glyph={''} />);
    // The mark, the notehead and its stem.
    expect(container.querySelectorAll('svg path')).toHaveLength(3);
    rerender(<GlyphIcon glyph="G" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container).toHaveTextContent('G');
  });

  it('draws drawn parts stroked and solid parts filled', () => {
    const { container } = render(
      <StripIcon spec={[{ path: 'M0 0h4' }, { path: 'M0 0h4v4z', fill: true }]} />,
    );
    const [stroked, filled] = container.querySelectorAll('svg path');
    expect(stroked).toHaveAttribute('stroke', 'currentColor');
    expect(stroked).toHaveAttribute('fill', 'none');
    expect(filled).toHaveAttribute('fill', 'currentColor');
    expect(filled).toHaveAttribute('stroke', 'none');
  });
});
