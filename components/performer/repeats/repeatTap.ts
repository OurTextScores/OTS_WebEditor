import { barAt, type BarBox } from '../session/barBoxes';
import { jumpForTap, type Jump, type Passes } from './repeatJumps';

/** The engine SVG classes of repeat signs: barlines (end repeats), D.C./D.S./To Coda/Fine, segno/coda, voltas. */
export const REPEAT_SIGN_SELECTOR = '.BarLine, .Jump, .Marker, .VoltaSegment';
/** Of those, the texts and signs that can jump forward (To Coda, segno/coda marks, D.C./D.S.). */
export const JUMP_TEXT_SELECTOR = '.Jump, .Marker';

/** A finger is wider than a barline: a tap this close to a bar's end counts as on its end-repeat. */
const NEAR_BAR_END = 0.1;

/**
 * The jump a tap takes, or null when it is an ordinary tap (which turns the page). A tap is on a repeat sign when it
 * hits one (`onSign`), or lands in the last tenth of a bar the music jumps from; and the bar must have a jump left.
 */
export function jumpForRepeatTap(input: {
  readonly onSign: boolean;
  /** On jump text or a marker: forward jumps count too. */
  readonly onJumpText?: boolean;
  readonly bars: readonly BarBox[];
  readonly page: number;
  readonly fx: number;
  readonly fy: number;
  readonly jumps: readonly Jump[];
  readonly passes: Passes;
}): Jump | null {
  const bar = barAt(input.bars, input.page, input.fx, input.fy);
  if (!bar) return null;
  const nearEnd = input.fx >= bar.x + bar.width * (1 - NEAR_BAR_END);
  if (!input.onSign && !nearEnd) return null;
  return jumpForTap(input.jumps, bar.index, input.passes, input.onJumpText === true);
}
