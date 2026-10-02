import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The design tokens live in app/globals.css (docs/private/DESIGN_LANGUAGE.md §3). This reads
 * them from there, so the CSS stays the single source and a changed value cannot silently drop a
 * text/surface pair under WCAG AA.
 */
const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');

function token(name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!match) throw new Error(`${name} is not a hex colour in globals.css`);
  return match[1];
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrast = (a: string, b: string) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

describe('design tokens: contrast', () => {
  const surfaces = ['--ots-surface', '--ots-surface-sunken', '--ots-surface-hover'];

  // Text: WCAG AA, 4.5:1.
  const text: [string, string[]][] = [
    ['--ots-text', surfaces],
    ['--ots-text-muted', surfaces],
    ['--ots-text-faint', ['--ots-surface', '--ots-surface-sunken']],
    ['--ots-accent', [...surfaces, '--ots-accent-soft']],
    ['--ots-success', ['--ots-surface', '--ots-success-soft']],
    ['--ots-warning', ['--ots-surface', '--ots-warning-soft']],
    ['--ots-danger', ['--ots-surface', '--ots-danger-soft']],
  ];
  for (const [foreground, backgrounds] of text) {
    for (const background of backgrounds) {
      it(`${foreground} on ${background} is at least 4.5:1`, () => {
        expect(contrast(token(foreground), token(background))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('text on the accent is at least 4.5:1', () => {
    expect(contrast(token('--ots-on-accent'), token('--ots-accent'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('--ots-on-accent'), token('--ots-accent-hover'))).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  // UI components: WCAG 1.4.11, 3:1 for the edge of a control.
  it('the control border is at least 3:1 against every surface', () => {
    for (const surface of surfaces) {
      expect(
        contrast(token('--ots-border-control'), token(surface)),
        surface,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('the focus ring (the accent) is at least 3:1 against every surface', () => {
    for (const surface of surfaces) {
      expect(contrast(token('--ots-accent'), token(surface)), surface).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('design tokens: structure', () => {
  it('orders the layers lowest first', () => {
    const layers = [
      'canvas',
      'panel',
      'status',
      'toolbar',
      'activity',
      'header',
      'float',
      'toast',
      'menu',
      'palette',
    ].map((name) => Number(css.match(new RegExp(`--ots-z-${name}:\\s*(\\d+)`))?.[1]));
    expect(layers.every((value) => Number.isFinite(value))).toBe(true);
    expect([...layers].sort((a, b) => a - b)).toEqual(layers);
  });

  it('keeps the shell names as aliases of the new tokens', () => {
    for (const [shell, ots] of [
      ['--shell-surface', '--ots-surface-sunken'],
      ['--shell-surface-raised', '--ots-surface'],
      ['--shell-border', '--ots-border'],
      ['--shell-text', '--ots-text'],
      ['--shell-text-muted', '--ots-text-muted'],
      ['--shell-accent', '--ots-accent'],
    ]) {
      expect(css).toContain(`${shell}: var(${ots});`);
    }
  });

  it('honours prefers-reduced-motion', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*transition-duration/);
  });
});
