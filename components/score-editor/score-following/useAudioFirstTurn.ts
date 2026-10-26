import { useMemo, useRef } from 'react';
import { updateFollowState } from '../../../lib/playback/score-following';
import type { PlaybackFollowing } from './usePlaybackFollowing';

/**
 * Audio first (Phase 9 F1): an automatic turn to a page that is not prepared waits until the audio already scheduled
 * covers about twice the expected render, so the render cannot starve audio pulls (right after a seek the buffer is
 * nearly empty). Until then the current page stays, marked "Preparing page N…". Prepared pages turn at once.
 */
const TURN_CUSHION_MIN_S = 0.5;
/** Before any render has been timed. */
const UNKNOWN_RENDER_MS = 400;

export function turnReady(following: PlaybackFollowing, page: number): boolean {
  const { pagePrepared, prefetchLeadMs } = following.prefetchRef.current;
  if (!pagePrepared || pagePrepared(page)) return true;
  // prefetchLeadMs is four average renders; 0 until a render has been timed.
  const renderMs = (prefetchLeadMs?.() ?? 0) / 4 || UNKNOWN_RENDER_MS;
  const cushion = Math.max(TURN_CUSHION_MIN_S, (2 * renderMs) / 1000);
  return following.transportRef.current.bufferedAheadSeconds() >= cushion;
}

export function useAudioFirstTurn(following: PlaybackFollowing) {
  const deferredRef = useRef<number | null>(null);
  return useMemo(
    () => ({
      deferredRef,
      ready: (page: number) => turnReady(following, page),
      hold(page: number) {
        if (deferredRef.current === page) return;
        deferredRef.current = page;
        updateFollowState({ preparingPage: page });
      },
      release() {
        if (deferredRef.current === null) return;
        deferredRef.current = null;
        updateFollowState({ preparingPage: null });
      },
    }),
    [following],
  );
}
