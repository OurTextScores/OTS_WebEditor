import type {
  PlaybackOptions,
  PlaybackOptionsRequest,
  PlaybackTimeForPosition,
  PlaybackTimeline,
  Score,
} from '../webmscore-loader';

export type PlaybackOptionsChange = {
  /** `applied`: the native options changed. `unchanged`: accepted as-is. `unavailable`: the engine lacks options. */
  status: 'applied' | 'unchanged' | 'unavailable';
  accepted: PlaybackOptions | null;
  /** The new-option timeline, when the change was applied. Its `optionsRevision` matches `accepted.revision`. */
  timeline: PlaybackTimeline | null;
  /** Presentation time before the change (old time base) and the same musical location after it. */
  fromMs: number;
  toMs: number;
  /** How the location was carried across: null when no conversion was needed or possible. */
  mapped: PlaybackTimeForPosition | null;
};

/**
 * Applies every pending options request (latest wins) and carries one musical location across them. The location is
 * captured once, under the options in effect before the first request, so an intermediate repeat-off state cannot
 * erase the original pass. The caller retires audio first: a native change also retires the project's stream.
 */
export async function applyPlaybackOptions(
  score: Score,
  fromMs: number,
  takePending: () => PlaybackOptionsRequest | null,
): Promise<PlaybackOptionsChange> {
  const unchanged = (
    accepted: PlaybackOptions | null,
    status: PlaybackOptionsChange['status'],
  ) => ({
    status,
    accepted,
    timeline: null,
    fromMs,
    toMs: fromMs,
    mapped: null,
  });
  if (!score.setPlaybackOptions) {
    while (takePending()) {
      /* drop: unsupported engines keep their only behaviour */
    }
    return unchanged(null, 'unavailable');
  }
  const position = (await score.playbackPositionAt?.(fromMs)) ?? null;
  let accepted: PlaybackOptions | null = null;
  let changed = false;
  let mapped: PlaybackTimeForPosition | null | undefined = null;
  let timeline: PlaybackTimeline | null = null;
  for (let next = takePending(); next;) {
    const result = await score.setPlaybackOptions(next);
    if (!result) return unchanged(null, 'unavailable');
    accepted = result;
    changed ||= result.changed === true;
    next = takePending();
    if (!next && changed) {
      // Reads for the settled options; a request arriving meanwhile is applied and the reads repeated.
      mapped = position ? await score.playbackTimeForPosition?.(position) : null;
      timeline = (await score.playbackTimeline?.()) ?? null;
      next = takePending();
    }
  }
  if (!changed) return unchanged(accepted, 'unchanged');
  return {
    status: 'applied',
    accepted,
    timeline,
    fromMs,
    toMs: mapped?.timeMs ?? fromMs,
    mapped: mapped ?? null,
  };
}

/** A Play target computed in the old time base, while a transaction ran, moves with the location it named. */
export const movedTarget = (change: PlaybackOptionsChange | null | undefined, targetMs: number) =>
  change?.status === 'applied' && Math.abs(targetMs - change.fromMs) < 1 ? change.toMs : targetMs;
