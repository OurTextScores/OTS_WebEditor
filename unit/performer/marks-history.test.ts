import { describe, expect, it } from 'vitest';
import {
  changesTo,
  describeMark,
  EMPTY_HISTORY,
  recorded,
} from '../../components/performer/annotations/annotationHistory';
import type { Annotation } from '../../components/performer/annotations/annotationModel';
import { undoKeyOf } from '../../components/performer/annotations/useUndoKeys';

const mark = (id: string, extra: Partial<Annotation> = {}): Annotation => ({
  id,
  scoreKey: 's',
  scorePart: 0,
  kind: 'stamp',
  anchor: { bar: 2, part: 0 },
  points: [[0, 0, 1]],
  style: { color: 'black', width: 0, opacity: 1 },
  content: 'dynamicMF',
  createdAt: 0,
  ...extra,
});

describe('marks history', () => {
  it('records steps, undoes and redoes them in order, and drops redo steps after a new change', () => {
    const a = mark('a');
    const b = mark('b');
    let history = recorded(EMPTY_HISTORY, {
      id: 1,
      description: 'A',
      changes: [{ before: null, after: a }],
    });
    history = recorded(history, { id: 2, description: 'B', changes: [{ before: null, after: b }] });
    expect(history.index).toBe(2);
    // Back to the start: B removed, then A
    expect(changesTo(history, 0)).toEqual([
      { before: b, after: null },
      { before: a, after: null },
    ]);
    const undone = { ...history, index: 1 };
    expect(changesTo(undone, 2)).toEqual([{ before: null, after: b }]);
    // A new step after an undo replaces the redo step
    const c = mark('c');
    const branched = recorded(undone, {
      id: 3,
      description: 'C',
      changes: [{ before: null, after: c }],
    });
    expect(branched.steps.map((step) => step.description)).toEqual(['A', 'C']);
  });

  it('describes marks in a few words', () => {
    expect(describeMark(mark('a'))).toBe('Stamp mf, bar 3');
    expect(
      describeMark(mark('b', { kind: 'ink', style: { color: 'red', width: 1.6, opacity: 0.3 } })),
    ).toBe('Highlighter, bar 3');
    expect(describeMark(mark('c', { kind: 'text', content: 'breathe' }))).toBe(
      'Text “breathe”, bar 3',
    );
  });

  it("knows the editor's undo and redo keys", () => {
    const key = (init: KeyboardEventInit) => undoKeyOf(new KeyboardEvent('keydown', init));
    expect(key({ key: 'z', ctrlKey: true })).toBe('undo');
    expect(key({ key: 'z', metaKey: true })).toBe('undo');
    expect(key({ key: 'Z', metaKey: true, shiftKey: true })).toBe('redo');
    expect(key({ key: 'y', ctrlKey: true })).toBe('redo');
    expect(key({ key: 'z' })).toBeNull();
    expect(key({ key: 'z', ctrlKey: true, altKey: true })).toBeNull();
  });
});
