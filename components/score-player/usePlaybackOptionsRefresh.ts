import { continuousCursorAllowed } from '@/lib/playback/release-gates';
import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react';
import type { HighlightMode } from '@/lib/playback/player-message-api';
import { usePlaybackOptionsSync } from '@/lib/playback/use-playback-options';
import type { PlaybackOptionsChange } from '@/lib/playback/options-transaction';
import type {
  PlaybackOptions,
  PlaybackFollowMap,
  PlaybackOptionsRequest,
  PlaybackTimeline,
  Positions,
  Score,
} from '@/lib/webmscore-loader';

type Targets = {
  setTimeline: (timeline: PlaybackTimeline) => void;
  setPositions: (positions: Positions) => void;
  setFollowMap: (map: PlaybackFollowMap | null) => void;
  notes: { modeRef: MutableRefObject<HighlightMode>; fetchSegments: (score: Score) => unknown };
};

type PlayerTransport = {
  playbackOptions: PlaybackOptions | null;
  setPlaybackOptions: (request: PlaybackOptionsRequest) => Promise<PlaybackOptionsChange>;
};

/**
 * Plays the score at the remembered speed and repeat setting (shared with the editor), and keeps the player's
 * timing in step with them.
 *
 * Timeline, measure positions and note positions carry event times in the playback-options time base. When the
 * transport accepts a new options revision, re-read them from the same score so following, clicks and seeking use
 * the traversal and tempo the audio now uses. Revision 0 is what the score loaded with: nothing to refresh.
 */
export function usePlaybackOptionsRefresh(
  scoreRef: MutableRefObject<Score | null>,
  score: Score | null,
  transport: PlayerTransport,
  targets: Targets,
) {
  usePlaybackOptionsSync({ score, transport });
  const options = transport.playbackOptions;
  // Read at completion, so a refresh is triggered by the revision alone.
  const targetsRef = useRef(targets);
  useLayoutEffect(() => {
    targetsRef.current = targets;
  });
  const revision = options?.revision ?? 0;
  useEffect(() => {
    const score = scoreRef.current;
    if (!revision || !score) return;
    let current = true;
    void Promise.all([
      Promise.resolve(score.playbackTimeline?.() ?? null).catch(() => null),
      score.measurePositions().catch(() => null),
      continuousCursorAllowed()
        ? Promise.resolve(score.playbackFollowMap?.() ?? null).catch(() => null)
        : null,
    ]).then(([timeline, positions, followMap]) => {
      if (!current || scoreRef.current !== score) return;
      const { setTimeline, setPositions, setFollowMap, notes } = targetsRef.current;
      if (timeline) setTimeline(timeline);
      if (positions) setPositions(positions);
      setFollowMap(followMap);
      if (notes.modeRef.current === 'note') void notes.fetchSegments(score);
    });
    return () => {
      current = false;
    };
  }, [revision, scoreRef]);
}
