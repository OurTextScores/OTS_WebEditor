import { describe, expect, it } from 'vitest';
import { NoteColorEffects } from '@/components/score-player/view-effects';

function note(fill?: string, stroke?: string): SVGElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  if (fill !== undefined) node.setAttribute('fill', fill);
  if (stroke !== undefined) node.setAttribute('stroke', stroke);
  return node;
}

describe('note color effects', () => {
  it('composes owners deterministically and restores each original attribute', () => {
    const effects = new NoteColorEffects();
    const head = note('purple');
    effects.set('playback', [head], { color: 'cyan', priority: 1 });
    effects.set('diagnostic', [head], { color: 'orange', priority: 2 });
    expect(head.getAttribute('fill')).toBe('orange');
    effects.clear('playback');
    expect(head.getAttribute('stroke')).toBe('orange');
    effects.set('playback', [head], { color: 'cyan', priority: 1 });
    effects.clear('diagnostic');
    expect(head.getAttribute('fill')).toBe('cyan');
    effects.clear('playback');
    expect(head.getAttribute('fill')).toBe('purple');
    expect(head.hasAttribute('stroke')).toBe(false);
  });

  it('uses owner name as a stable tie breaker and handles target replacement and disposal', () => {
    const effects = new NoteColorEffects();
    const oldHead = note('red', 'blue');
    const newHead = note();
    effects.set('z', [oldHead], { color: 'green', priority: 0 });
    effects.set('a', [oldHead], { color: 'yellow', priority: 0 });
    expect(oldHead.getAttribute('fill')).toBe('yellow');
    effects.set('a', [newHead], { color: 'yellow', priority: 0 });
    expect(oldHead.getAttribute('fill')).toBe('green');
    expect(newHead.getAttribute('fill')).toBe('yellow');
    effects.dispose();
    expect(oldHead.getAttribute('fill')).toBe('red');
    expect(oldHead.getAttribute('stroke')).toBe('blue');
    expect(newHead.hasAttribute('fill')).toBe(false);
    expect(newHead.hasAttribute('stroke')).toBe(false);
  });
});
