export type TransportClockAnchor = {
  contextTime: number;
  scoreTimeSeconds: number;
};

export function scoreTimeAt(
  anchor: TransportClockAnchor | null,
  contextTime: number,
): number | null {
  if (!anchor || !Number.isFinite(contextTime)) return null;
  return anchor.scoreTimeSeconds + Math.max(0, contextTime - anchor.contextTime);
}

export function clampScorePosition(positionMs: number, durationMs: number): number {
  const safePosition = Number.isFinite(positionMs) ? positionMs : 0;
  const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  return Math.min(safeDuration, Math.max(0, safePosition));
}

/** Output-aligned context time, with a bounded fallback for browsers/devices without valid timestamps. */
export function presentationContextTime(
  context: Pick<AudioContext, 'currentTime' | 'state'> &
    Partial<Pick<AudioContext, 'getOutputTimestamp' | 'outputLatency' | 'baseLatency'>>,
  nowMs = performance.now(),
): number {
  const current = context.currentTime;
  if (context.state === 'running' && context.getOutputTimestamp) {
    try {
      const stamp = context.getOutputTimestamp();
      if (
        stamp.contextTime &&
        stamp.performanceTime &&
        Number.isFinite(stamp.contextTime) &&
        Number.isFinite(stamp.performanceTime) &&
        stamp.performanceTime <= nowMs + 100 &&
        nowMs - stamp.performanceTime < 1000
      ) {
        const aligned = stamp.contextTime + (nowMs - stamp.performanceTime) / 1000;
        if (aligned >= current - 1 && aligned <= current + 0.1)
          return Math.max(0, Math.min(current, aligned));
      }
    } catch {
      /* A context/device without output timestamp support uses its reported latency. */
    }
  }
  const latency = context.outputLatency ?? context.baseLatency ?? 0;
  return Math.max(0, current - (Number.isFinite(latency) ? Math.min(1, Math.max(0, latency)) : 0));
}
