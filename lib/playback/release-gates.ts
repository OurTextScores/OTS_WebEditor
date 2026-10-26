/**
 * Release-time escape hatches for score following (design §18 Phase 9). Build-time only, read at call time so tests
 * can stub them; the defaults are the full feature set. Audio, speed and repeat controls are never gated here.
 *
 * - `NEXT_PUBLIC_OTS_PLAYBACK_CURSOR`: `continuous` (default) | `segment` (no native follow map: the cursor steps
 *   from note to note) | `measure` (no note positions either: measure tracking only).
 * - `NEXT_PUBLIC_OTS_PLAYBACK_AUTOFOLLOW=0`: no automatic page turns or scrolling; the cursor still draws and
 *   Jump to playback still works.
 */
export type CursorCeiling = 'continuous' | 'segment' | 'measure';

export function playbackCursorCeiling(): CursorCeiling {
  const value = process.env.NEXT_PUBLIC_OTS_PLAYBACK_CURSOR;
  return value === 'segment' || value === 'measure' ? value : 'continuous';
}

export const continuousCursorAllowed = () => playbackCursorCeiling() === 'continuous';
export const segmentTrackingAllowed = () => playbackCursorCeiling() !== 'measure';
export const autoFollowAllowed = () => process.env.NEXT_PUBLIC_OTS_PLAYBACK_AUTOFOLLOW !== '0';
