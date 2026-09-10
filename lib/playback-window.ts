/**
 * Render-ahead windowing for streamed synth playback.
 *
 * See docs/private/MUSE_SOUNDS_INTEGRATION_ROADMAP.md, Phase 2.
 *
 * The synth stream pulls rendered chunks from WASM and schedules each one as an
 * AudioBufferSourceNode. Without a bound it pulls as fast as the engine resolves,
 * so the *entire* score is rendered and scheduled before much of it has played:
 * faure.mscz (22 minutes) means ~115k source nodes and ~450 MB of AudioBuffers
 * held at once, with the render loop competing with the main thread throughout.
 *
 * Bounding it takes two things, and the window is only one of them:
 *
 *  1. the render horizon here, which stops work running arbitrarily far *ahead* of
 *     the playhead, and
 *  2. releasing each source once it has played, which stops buffers accumulating
 *     *behind* it — see `releaseScheduledSource`.
 *
 * Without (2) the horizon alone does not bound memory at all: rendering stays close
 * to the playhead, but every buffer it ever produced is still strongly referenced by
 * the live-sources array, so a long score retains just as much as before. An earlier
 * revision of this file claimed the horizon alone bounded memory. It does not.
 *
 * The horizon is also the precondition for Phase 5: a lookahead scheduler needs a
 * horizon at least as long as its longest forward dependency, and that horizon has
 * to be one number someone can raise.
 */

export interface RenderWindow {
  /** Stop pulling once scheduled audio reaches this far ahead of the playhead. */
  horizonSeconds: number;
  /** Resume pulling once it falls back to this. */
  lowWaterSeconds: number;
}

/**
 * Default horizon for transport playback. Twenty seconds is far enough that a
 * stall in the render loop is inaudible, and short enough that a long score costs
 * a bounded ~7 MB of buffers rather than hundreds.
 *
 * Phase 5 will need to raise `horizonSeconds` to cover phrase-level lookahead;
 * that is why this is a named constant and not a literal in the stream loop.
 */
export const DEFAULT_RENDER_WINDOW: RenderWindow = {
  horizonSeconds: 20,
  lowWaterSeconds: 10,
};

/**
 * How long to idle before pulling the next batch.
 *
 * @param aheadSeconds how far scheduled audio currently extends beyond the playhead
 * @param draining whether the horizon was already crossed and hysteresis is draining to low water
 * @returns milliseconds to wait; 0 means pull immediately
 */
export function renderWindowDelayMs(
  aheadSeconds: number,
  window: RenderWindow = DEFAULT_RENDER_WINDOW,
  draining = false,
): number {
  if (!Number.isFinite(aheadSeconds)) {
    // A non-finite reading means the caller has no usable clock yet. Keep
    // pulling rather than stalling playback on a bad measurement.
    return 0;
  }

  const horizon = Math.max(0, window.horizonSeconds);
  const lowWater = Math.min(Math.max(0, window.lowWaterSeconds), horizon);

  if (!draining && aheadSeconds <= horizon) {
    return 0;
  }

  // Idle until the buffer drains to the low-water mark, so we refill in batches
  // rather than waking on every chunk.
  return Math.max(0, (aheadSeconds - lowWater) * 1000);
}

/**
 * Upper bound on simultaneously held audio buffers for a given window.
 *
 * Only achievable if played sources are released as they finish; the horizon alone
 * caps how far *ahead* buffers are produced, not how many are retained.
 */
export function maxBufferedChunks(
  window: RenderWindow,
  sampleRate: number,
  framesPerChunk: number,
): number {
  return Math.ceil((window.horizonSeconds * sampleRate) / framesPerChunk);
}

/** The subset of AudioBufferSourceNode this module needs, so it is testable with fakes. */
export interface ReleasableSource {
  disconnect: () => void;
}

/**
 * Drops a finished source from the live-sources list and disconnects it, so its
 * AudioBuffer becomes collectable.
 *
 * Sources are pushed as they are scheduled and, without this, removed only when the
 * *final* one ends — which for a 22-minute score means ~115k nodes and ~450MB of
 * buffers retained until playback finishes, and a stop that has to iterate all of
 * them. Identity-based removal keeps the list at roughly the render window's size,
 * which is what makes the O(n) scan here cheap.
 */
export function releaseScheduledSource<T extends ReleasableSource>(sources: T[], source: T): void {
  try {
    source.disconnect();
  } catch {
    // Already disconnected, or the context is gone. Either way it is released.
  }

  const index = sources.indexOf(source);
  if (index !== -1) {
    sources.splice(index, 1);
  }
}
