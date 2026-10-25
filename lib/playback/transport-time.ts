/**
 * The header's position / duration label, published at a few updates per second from the editor transport's
 * position subscription. The editor root does not re-render for it, and nothing here touches the audio clock.
 */
export interface TransportTime {
  readonly positionMs: number;
  readonly durationMs: number;
}

const ZERO: TransportTime = { positionMs: 0, durationMs: 0 };
const listeners = new Set<() => void>();
let current: TransportTime = ZERO;

export const getTransportTime = (): TransportTime => current;
export const getTransportTimeOnServer = (): TransportTime => ZERO;

export function subscribeTransportTime(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whole tenths of a second: finer changes would only repaint the same label. */
export function publishTransportTime(positionMs: number, durationMs: number): void {
  const next = {
    positionMs: Math.max(0, Math.round(positionMs / 100) * 100),
    durationMs:
      Number.isFinite(durationMs) && durationMs < Number.MAX_SAFE_INTEGER ? durationMs : 0,
  };
  if (next.positionMs === current.positionMs && next.durationMs === current.durationMs) return;
  current = next;
  listeners.forEach((listener) => listener());
}
