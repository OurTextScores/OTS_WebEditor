import { describe, expect, it } from 'vitest';
import {
  combineSignatures,
  remapBar,
  shortHash,
  signatureAt,
} from '../../components/performer/annotations/barSignatures';

// Bars as letters: a repeated bar (B) shows why the neighbours matter
const score = ['A', 'B', 'C', 'B', 'D'];

describe('keeping marks on their bars', () => {
  it('hashes and combines per-part signatures bar by bar', () => {
    expect(shortHash('x')).toBe(shortHash('x'));
    expect(shortHash('x')).not.toBe(shortHash('y'));
    const combined = combineSignatures([
      ['a1', 'a2'],
      ['b1', 'b2', 'b3'],
    ]);
    expect(combined).toHaveLength(3);
    expect(new Set(combined).size).toBe(3);
  });

  it('stays when the bar is still there, and follows it when bars are inserted before it', () => {
    const mark = signatureAt(score, 3)!; // the second B, between C and D
    expect(remapBar(mark, 3, score)).toEqual({ bar: 3, status: 'same' });
    const inserted = ['A', 'X', 'Y', 'B', 'C', 'B', 'D'];
    expect(remapBar(mark, 3, inserted)).toEqual({ bar: 5, status: 'moved' }); // not the first B (index 3)
  });

  it('follows a bar when bars before it are removed', () => {
    const mark = signatureAt(score, 4)!; // D
    expect(remapBar(mark, 4, ['A', 'B', 'D'])).toEqual({ bar: 2, status: 'moved' });
  });

  it('stays, as changed, when its own bar was edited and nothing matches', () => {
    const mark = signatureAt(score, 2)!; // C
    expect(remapBar(mark, 2, ['A', 'B', 'Q', 'B', 'D'])).toEqual({ bar: 2, status: 'changed' });
  });

  it('stays when only a neighbour changed', () => {
    const mark = signatureAt(score, 2)!;
    expect(remapBar(mark, 2, ['A', 'Z', 'C', 'B', 'D'])).toEqual({ bar: 2, status: 'same' });
  });

  it('goes by index when the mark has no signature', () => {
    expect(remapBar(undefined, 1, score)).toEqual({ bar: 1, status: 'unknown' });
  });
});
