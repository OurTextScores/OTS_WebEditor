import type { BrowserContext, Frame } from 'playwright/test';

const FRAME_TIMEOUT_MS = 2_000;
const MAX_FRAMES = 16;

type FrameReport = {
  page: number;
  frame: number;
  state: 'captured' | 'unavailable' | 'timed-out';
  diagnostics?: unknown;
};

/** Collect only the public RPC metadata, omitting URLs, scores, arguments, and results. */
export async function collectWorkerRpcDiagnostics(context: BrowserContext): Promise<{ version: 1; capturedAt: number; frames: FrameReport[]; omittedFrames: number }> {
  const frames = context.pages().flatMap((page, pageIndex) =>
    page.frames().map((frame, frameIndex) => ({ frame, page: pageIndex, index: frameIndex })),
  );
  const capture = async ({ frame, page, index }: { frame: Frame; page: number; index: number }): Promise<FrameReport> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        frame.evaluate(() => {
          const store = (window as unknown as { __webmscoreRpcDiagnostics?: { pending?: Record<string, unknown>; recent?: unknown[] } }).__webmscoreRpcDiagnostics;
          if (!store || typeof store !== 'object') return null;
          const allowedStatuses = new Set(['pending', 'success', 'error', 'worker-error', 'message-error', 'send-error', 'terminated']);
          const clean = (value: unknown) => {
            if (!value || typeof value !== 'object') return null;
            const row = value as Record<string, unknown>;
            if (typeof row.id !== 'number' || !Number.isFinite(row.id) ||
                typeof row.method !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]{0,79}$/.test(row.method) ||
                typeof row.status !== 'string' || !allowedStatuses.has(row.status)) return null;
            const numberOrNull = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? n : null;
            const errorName = typeof row.errorName === 'string' && /^[A-Za-z_$][A-Za-z0-9_$]{0,79}$/.test(row.errorName) ? row.errorName : undefined;
            return { id: row.id, method: row.method, startedAt: numberOrNull(row.startedAt), endedAt: numberOrNull(row.endedAt), elapsedMs: numberOrNull(row.elapsedMs), status: row.status, ...(errorName ? { errorName } : {}) };
          };
          return {
            pending: Object.values(store.pending || {}).slice(0, 200).map(clean).filter(Boolean),
            recent: (Array.isArray(store.recent) ? store.recent : []).slice(-200).map(clean).filter(Boolean),
          };
        }).then((diagnostics) => ({ state: 'captured' as const, diagnostics })),
        new Promise<{ state: 'timed-out' }>((resolve) => { timer = setTimeout(() => resolve({ state: 'timed-out' }), FRAME_TIMEOUT_MS); }),
      ]);
      return { page, frame: index, ...result };
    } catch {
      return { page, frame: index, state: 'unavailable' };
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  const capturedFrames = await Promise.all(frames.slice(0, MAX_FRAMES).map(capture));
  return { version: 1, capturedAt: Date.now(), frames: capturedFrames, omittedFrames: Math.max(0, frames.length - MAX_FRAMES) };
}
