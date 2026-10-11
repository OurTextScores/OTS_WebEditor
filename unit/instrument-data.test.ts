import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { instrumentDataUrl } from '../components/score-editor/new-score';

describe('instrumentDataUrl', () => {
  it('reads the route handlers on a normal deployment', () => {
    expect(instrumentDataUrl('clefs', false)).toBe('/api/instruments/clefs');
    expect(instrumentDataUrl('templates', false)).toBe('/api/instruments/templates');
  });

  it('reads the shipped files in the static embed, which has no route handlers', () => {
    // The regression: the embed asked its host site for /api/instruments/* and got a 404, so the
    // New Score dialog opened with two warnings and a treble clef for every instrument.
    expect(instrumentDataUrl('clefs', true)).toBe('/score-editor/data/clefs.json');
    expect(instrumentDataUrl('templates', true)).toBe('/score-editor/data/templates.json');
  });

  it('points at files that exist and have the shape the dialog reads', () => {
    const read = (kind: 'clefs' | 'templates') => {
      const file = instrumentDataUrl(kind, true).replace('/score-editor/', '');
      return JSON.parse(readFileSync(path.join(process.cwd(), 'public', file), 'utf8'));
    };
    const clefs = read('clefs');
    expect(Object.keys(clefs.map).length).toBeGreaterThan(100);
    expect(clefs.map.violoncello ?? clefs.map.cello).toBeDefined();
    const templates = read('templates');
    expect(Array.isArray(templates.groups)).toBe(true);
    expect(templates.groups.length).toBeGreaterThan(5);
  });
});
