import { useEffect, useMemo, useRef, useState } from 'react';
import type { BarBox } from '../session/barBoxes';
import type { PerformerScoreState } from '../session/usePerformerScore';
import { afterJump, firstPlayedIndex, jumpsOf, type Passes } from './repeatJumps';
import { jumpForRepeatTap } from './repeatTap';

/** How long the bar a jump lands on stays highlighted. */
const FLASH_MS = 1500;

/**
 * Repeats in the perform view (Phase 3). In the written view, a tap on a repeat sign jumps where the music goes next
 * and highlights that bar for a moment; in the Play-through view (repeats written out) there is nothing to jump.
 * Switching between the two keeps the reader's place: the written bar at the top of the page is found again.
 */
export function usePerformerRepeats(input: {
  readonly state: PerformerScoreState;
  readonly playThrough: boolean;
  readonly goToBar: (bar: number) => void;
}) {
  const { state, playThrough, goToBar } = input;
  const jumps = useMemo(
    () => (playThrough ? [] : jumpsOf(state.playedBars)),
    [playThrough, state.playedBars],
  );
  const [passes, setPasses] = useState<Passes>(new Map());
  const [flash, setFlash] = useState<BarBox | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  /** Takes the jump a tap asks for (fractions of the page), and says whether it did. */
  const jumpOnTap = (onSign: boolean, onJumpText: boolean, fx: number, fy: number): boolean => {
    const jump = jumpForRepeatTap({
      onSign,
      onJumpText,
      bars: state.bars,
      page: state.page,
      fx,
      fy,
      jumps,
      passes,
    });
    if (!jump) return false;
    setPasses((previous) => afterJump(previous, jump));
    goToBar(jump.to);
    const target = state.bars.find((bar) => bar.index === jump.to) ?? null;
    setFlash(target);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), FLASH_MS);
    return true;
  };

  /** The written bar at the top of the shown page (to come back to after switching views), or null. */
  const writtenBarShown = (): number | null => {
    const first = state.bars
      .filter((bar) => bar.page === state.page)
      .sort((a, b) => a.index - b.index)[0];
    if (!first) return null;
    return playThrough ? (state.playedBars[first.index] ?? null) : first.index;
  };

  // After a switch of view, once the new layout's bars are known: back to the written bar the reader was at
  const pendingBar = useRef<number | null>(null);
  useEffect(() => {
    const written = pendingBar.current;
    if (written === null || state.status !== 'ready' || !state.bars.length) return;
    pendingBar.current = null;
    goToBar(playThrough ? firstPlayedIndex(state.playedBars, written) : written);
  }, [state.bars, state.status, state.playedBars, playThrough, goToBar]);

  /** Call before switching view: remembers where the reader is. */
  const rememberPlace = () => {
    pendingBar.current = writtenBarShown();
    setPasses(new Map());
  };

  return { jumpOnTap, flash: flash && flash.page === state.page ? flash : null, rememberPlace };
}
