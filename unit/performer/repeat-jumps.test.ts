import { describe, expect, it } from 'vitest';
import {
  afterJump,
  firstPlayedIndex,
  jumpForTap,
  jumpsOf,
  type Passes,
} from '../../components/performer/repeats/repeatJumps';

// Bars 0-3 repeated with first/second endings (bar 3 is the first ending, bar 4 the second), then D.S. from bar 6
// back to the segno at bar 1, al Coda from bar 2 to the coda at bar 7
const PLAYED = [0, 1, 2, 3, 0, 1, 2, 4, 5, 6, 1, 2, 7, 8];

describe('repeats from the playing order', () => {
  it('finds each jump: back for the repeat, over the first ending, the D.S. and the coda', () => {
    expect(jumpsOf(PLAYED)).toEqual([
      { order: 0, from: 3, to: 0 },
      { order: 1, from: 2, to: 4 },
      { order: 2, from: 6, to: 1 },
      { order: 3, from: 2, to: 7 },
    ]);
    expect(jumpsOf([0, 1, 2, 3])).toEqual([]);
  });

  it('takes the next jump from a bar on each tap, then lets the music go on', () => {
    const jumps = jumpsOf(PLAYED);
    let passes: Passes = new Map<number, number>();
    // The end-repeat in bar 3
    const back = jumpForTap(jumps, 3, passes)!;
    expect(back).toMatchObject({ from: 3, to: 0 });
    passes = afterJump(passes, back);
    expect(jumpForTap(jumps, 3, passes)).toBeNull(); // played twice: no more jumping back
    // Bar 2's barline never jumps forward; its To Coda text does: over the first ending, then to the coda
    expect(jumpForTap(jumps, 2, passes)).toBeNull();
    const overEnding = jumpForTap(jumps, 2, passes, true)!;
    expect(overEnding.to).toBe(4);
    passes = afterJump(passes, overEnding);
    expect(jumpForTap(jumps, 2, passes, true)?.to).toBe(7);
    // The D.S. at bar 6 goes back to the segno: a backward jump, so its barline counts too
    expect(jumpForTap(jumps, 6, passes)).toMatchObject({ from: 6, to: 1 });
    // No jump from bar 5
    expect(jumpForTap(jumps, 5, new Map())).toBeNull();
  });

  it("does not jump from a second ending's bar (the music continues there)", () => {
    expect(jumpForTap(jumpsOf([0, 1, 0, 2]), 2, new Map())).toBeNull();
  });

  it('maps a written bar to its first bar in the Play-through view', () => {
    expect(firstPlayedIndex(PLAYED, 4)).toBe(7);
    expect(firstPlayedIndex(PLAYED, 1)).toBe(1);
    expect(firstPlayedIndex(PLAYED, 99)).toBe(0);
  });
});
