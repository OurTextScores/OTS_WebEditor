import { useEffect, useState } from 'react';
import type { TurnEvent } from '../turning/turnMachine';
import { edgeTurn, pieceBeyond } from './setlistModel';

/** Where the shown piece sits in its setlist, and how to go to another piece. */
export interface SetlistNav {
  readonly name: string;
  readonly index: number;
  readonly names: readonly string[];
  readonly scores: readonly string[];
  readonly go: (index: number) => void;
}

/**
 * The setlist edge in the perform view: a turn that cannot turn a page (past the last, before the first) shows the
 * neighbouring piece's card; the same turn again goes to it. Also warms the browser's cache with the next piece.
 */
export function useSetlistEdge(
  setlist: SetlistNav | null,
  ready: boolean,
  resolve: (score: string) => string,
) {
  const [card, setCard] = useState<TurnEvent | null>(null);
  const count = setlist?.names.length ?? 0;
  const nextScore = setlist ? setlist.scores[setlist.index + 1] : undefined;

  useEffect(() => {
    if (!ready || !nextScore || nextScore.startsWith('local:')) return;
    const controller = new AbortController();
    fetch(resolve(nextScore), { signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [ready, nextScore, resolve]);

  /** A turn that turned no page: whether the setlist took it (card shown, or gone to the next piece). */
  const atEdge = (event: TurnEvent): boolean => {
    if (!setlist) return false;
    const beyond = pieceBeyond(setlist.index, count, event);
    const result = edgeTurn(card, event, beyond);
    setCard(result.card);
    if (result.go && beyond !== null) setlist.go(beyond);
    return beyond !== null;
  };

  const target = setlist && card ? pieceBeyond(setlist.index, count, card) : null;
  return {
    atEdge,
    clear: () => setCard(null),
    card:
      setlist && card && target !== null
        ? { event: card, index: target, name: setlist.names[target] }
        : null,
    go: () => {
      if (setlist && target !== null) setlist.go(target);
    },
  };
}
