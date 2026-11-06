/*
 * Where the performer is (performer mode, Phase 2): a whole page, or half way through turning from one page to the
 * next (the top of page+1 above the bottom of page). "Next" goes page -> half -> next page when half-page turns are
 * on and the page can be split; "previous" goes back one step. Pedals and taps only ever turn pages (no jumps).
 */

export type TurnState = { readonly page: number; readonly half: boolean };
export type TurnEvent = 'next' | 'previous';

export interface TurnContext {
  readonly pageCount: number;
  readonly halfPages: boolean;
  /** Whether `page` can be shown half turned to the next (two systems or more, a next page with one that fits). */
  readonly canHalf: (page: number) => boolean;
}

export function step(state: TurnState, event: TurnEvent, context: TurnContext): TurnState {
  const last = Math.max(0, context.pageCount - 1);
  if (event === 'next') {
    if (state.half) return { page: Math.min(last, state.page + 1), half: false };
    if (state.page >= last) return state;
    if (context.halfPages && context.canHalf(state.page)) return { page: state.page, half: true };
    return { page: state.page + 1, half: false };
  }
  if (state.half) return { page: state.page, half: false };
  if (state.page <= 0) return state;
  return { page: state.page - 1, half: false };
}

/** The state for a layout with `pageCount` pages: the same page, whole, within range. */
export function clampTurn(state: TurnState, pageCount: number): TurnState {
  return { page: Math.min(Math.max(0, pageCount - 1), Math.max(0, state.page)), half: false };
}
