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
