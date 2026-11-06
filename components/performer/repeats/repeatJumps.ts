/*
 * Repeats in performer mode (Phase 3), from the playback timeline: the bars in the order they are played. Wherever
 * the next bar played is not the next bar written, the music jumps (a repeat, a second ending, D.C./D.S., a coda).
 * Tapping a repeat sign in a bar takes the next jump from that bar; a per-session pass count means a repeat played
 * twice jumps back once and then lets the reader go on. Pedals never jump: they only turn pages.
 */

export interface Jump {
  /** Its position among the jumps, in playing order. */
  readonly order: number;
  /** The written bar (measure index) the music leaves... */
  readonly from: number;
  /** ...and the written bar it continues at. */
  readonly to: number;
}

/** The jumps in `playedBars` (written measure indices in playing order). */
export function jumpsOf(playedBars: readonly number[]): Jump[] {
  const jumps: Jump[] = [];
  for (let i = 0; i + 1 < playedBars.length; i += 1) {
    if (playedBars[i + 1] !== playedBars[i] + 1) {
      jumps.push({ order: jumps.length, from: playedBars[i], to: playedBars[i + 1] });
    }
  }
  return jumps;
}

/** How many times the reader has jumped from each bar this session. */
export type Passes = ReadonlyMap<number, number>;

/**
 * The jump a tap on a repeat sign in `bar` takes, given the jumps already taken from it (`passes`), or null when the
 * music goes on from there (every jump from it taken, or none: a second ending's volta is where the music continues).
 * A barline only ever means "back" (an end-repeat); forward jumps (To Coda, D.C./D.S. al Fine's end) are taken only
 * from their text (`forward`). Skipping a first ending needs no tap: the second ending follows on the page.
 */
export function jumpForTap(
  jumps: readonly Jump[],
  bar: number,
  passes: Passes,
  forward = false,
): Jump | null {
  const from = jumps.filter((jump) => jump.from === bar && (forward || jump.to <= jump.from));
  return from[passes.get(bar) ?? 0] ?? null;
}

/** `passes` with one more jump taken from `jump.from`. */
export function afterJump(passes: Passes, jump: Jump): Passes {
  return new Map(passes).set(jump.from, (passes.get(jump.from) ?? 0) + 1);
}

/**
 * The Play-through view's bars map to written bars by playing order: Play-through bar i is `playedBars[i]`.
 * The first Play-through bar showing written bar `written` (its first time through).
 */
export function firstPlayedIndex(playedBars: readonly number[], written: number): number {
  const index = playedBars.indexOf(written);
  return index < 0 ? 0 : index;
}
