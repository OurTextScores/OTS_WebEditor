import { describe, expect, it } from 'vitest';
import { jumpsOf } from '../../components/performer/repeats/repeatJumps';
import { jumpForRepeatTap } from '../../components/performer/repeats/repeatTap';

// Three bars side by side on page 0; played 0, 1, 0, 2 (bar 1 is a first ending with an end-repeat)
const bars = [0, 1, 2].map((index) => ({
  index,
  page: 0,
  x: 0.1 + index * 0.3,
  y: 0.2,
  width: 0.3,
  height: 0.1,
}));
const jumps = jumpsOf([0, 1, 0, 2]);
const tap = (fx: number, onSign = false, passes = new Map<number, number>()) =>
  jumpForRepeatTap({ onSign, bars, page: 0, fx, fy: 0.25, jumps, passes });

describe('a tap on a repeat sign', () => {
  it('jumps back from the end-repeat, hit exactly or near the end of the bar', () => {
    expect(tap(0.7, true)).toMatchObject({ from: 1, to: 0 }); // on the barline
    expect(tap(0.68)).toMatchObject({ from: 1, to: 0 }); // within the last tenth of bar 1
  });

  it('is an ordinary tap elsewhere in the bar, off the music, or where no jump is left', () => {
    expect(tap(0.5)).toBeNull(); // the middle of bar 1, not on a sign
    expect(
      jumpForRepeatTap({ onSign: true, bars, page: 0, fx: 0.5, fy: 0.9, jumps, passes: new Map() }),
    ).toBeNull();
    expect(tap(0.7, true, new Map([[1, 1]]))).toBeNull(); // already jumped back once
    expect(tap(0.98, true)).toBeNull(); // bar 2: the music goes on
    expect(tap(0.38, true)).toBeNull(); // bar 0's barline: its only jump is forward (over the first ending)
  });
});
