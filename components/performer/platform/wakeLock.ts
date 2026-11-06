import { useEffect, useState } from 'react';

/*
 * Keeping the screen awake while performing (Screen Wake Lock). Safari has it since 16.4, and in installed Home
 * Screen web apps since iPadOS 18.4 (the minimum for performer mode). The lock is released whenever the page is
 * hidden, so it is requested again when the page is shown; it can be refused (low battery), which the view reports.
 */

export type WakeLockStatus = 'on' | 'off' | 'unsupported' | 'refused';

type Sentinel = {
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
};
type WakeLockApi = { request: (type: 'screen') => Promise<Sentinel> };

const wakeLockApi = (): WakeLockApi | null =>
  typeof navigator !== 'undefined' && 'wakeLock' in navigator
    ? ((navigator as Navigator & { wakeLock: WakeLockApi }).wakeLock ?? null)
    : null;

/** Holds a screen wake lock while `active` and the page is visible; returns what happened. */
export function useWakeLock(active: boolean): WakeLockStatus {
  const [status, setStatus] = useState<WakeLockStatus>(() =>
    wakeLockApi() ? 'off' : 'unsupported',
  );
  useEffect(() => {
    const api = wakeLockApi();
    if (!active || !api) return;
    let sentinel: Sentinel | null = null;
    let disposed = false;
    const acquire = async () => {
      if (disposed || document.visibilityState !== 'visible' || sentinel) return;
      try {
        const lock = await api.request('screen');
        if (disposed) {
          void lock.release();
          return;
        }
        sentinel = lock;
        setStatus('on');
        lock.addEventListener('release', () => {
          sentinel = null;
          if (!disposed) setStatus('off');
        });
      } catch {
        if (!disposed) setStatus('refused');
      }
    };
    const onVisibility = () => void acquire();
    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
  return status;
}
